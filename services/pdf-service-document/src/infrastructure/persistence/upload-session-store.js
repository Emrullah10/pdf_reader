import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const MANIFEST = 'manifest.json';

// Tracks multi-part uploads on disk. Chunks are appended to a single file as they arrive rather
// than kept as separate parts, so a 200MB upload costs one 200MB file and never more than one
// chunk of memory. State lives in a manifest beside it so a restart mid-upload is recoverable
// (and, more importantly, cleanable) instead of leaving an orphaned blob behind.
export const makeUploadSessionStore = ({ storageDir }) => {
  const sessionsDir = join(storageDir, 'uploads');
  const documentsDir = join(storageDir, 'documents');

  const sessionDir = (uploadId) => join(sessionsDir, uploadId);
  const manifestPath = (uploadId) => join(sessionDir(uploadId), MANIFEST);
  const partPath = (uploadId) => join(sessionDir(uploadId), 'part');

  const readManifest = async (uploadId) => {
    try {
      return JSON.parse(await readFile(manifestPath(uploadId), 'utf8'));
    } catch {
      return null;
    }
  };

  const writeManifest = (uploadId, manifest) =>
    writeFile(manifestPath(uploadId), JSON.stringify(manifest), 'utf8');

  return {
    async create({ userId, originalName, mime, totalBytes }) {
      const uploadId = randomUUID();
      await mkdir(sessionDir(uploadId), { recursive: true });

      const manifest = {
        uploadId,
        userId,
        originalName,
        mime,
        totalBytes,
        receivedBytes: 0,
        createdAt: new Date().toISOString(),
      };
      await writeManifest(uploadId, manifest);

      return manifest;
    },

    // Ownership is checked by the caller; returning null lets it answer 404 without leaking
    // whether the id exists for a different user.
    async find({ uploadId, userId }) {
      const manifest = await readManifest(uploadId);
      if (!manifest || manifest.userId !== userId) return null;
      return manifest;
    },

    // Appends one chunk and reports the new offset. `expectedOffset` makes the write idempotent:
    // a client that retries a chunk after a dropped connection sends the same offset, and a
    // mismatch means chunks arrived out of order — either way the data is never silently doubled.
    async appendChunk({ uploadId, userId, expectedOffset, chunkStream }) {
      const manifest = await this.find({ uploadId, userId });
      if (!manifest) return { error: 'not_found' };
      if (expectedOffset !== manifest.receivedBytes) {
        return { error: 'offset_mismatch', receivedBytes: manifest.receivedBytes };
      }

      await pipeline(chunkStream, createWriteStream(partPath(uploadId), { flags: 'a' }));

      const { size } = await stat(partPath(uploadId));
      if (size > manifest.totalBytes) {
        await rm(sessionDir(uploadId), { recursive: true, force: true });
        return { error: 'too_large' };
      }

      const updated = { ...manifest, receivedBytes: size };
      await writeManifest(uploadId, updated);

      return { manifest: updated, complete: size === manifest.totalBytes };
    },

    // Promotes the assembled part file to its final home. Renaming within the same filesystem is
    // atomic and free, so the finished PDF is never copied.
    async finalize({ uploadId, userId }) {
      const manifest = await this.find({ uploadId, userId });
      if (!manifest) return null;
      if (manifest.receivedBytes !== manifest.totalBytes) return null;

      await mkdir(documentsDir, { recursive: true });
      const storagePath = join(documentsDir, `${randomUUID()}.pdf`);

      await rename(partPath(uploadId), storagePath);
      await rm(sessionDir(uploadId), { recursive: true, force: true });

      return { manifest, storagePath };
    },

    async discard({ uploadId, userId }) {
      const manifest = await this.find({ uploadId, userId });
      if (!manifest) return false;
      await rm(sessionDir(uploadId), { recursive: true, force: true });
      return true;
    },

    // Abandoned sessions would otherwise pin disk forever — a browser tab closed mid-upload leaves
    // no one to finalize or discard them.
    async purgeExpired({ olderThanMs }) {
      let entries;
      try {
        entries = await readdir(sessionsDir);
      } catch {
        return 0;
      }

      const cutoff = Date.now() - olderThanMs;
      let purged = 0;

      for (const uploadId of entries) {
        const manifest = await readManifest(uploadId);
        const createdAt = manifest ? Date.parse(manifest.createdAt) : 0;

        // A directory with no readable manifest is debris from a crash; drop it too.
        if (!Number.isFinite(createdAt) || createdAt < cutoff) {
          await rm(sessionDir(uploadId), { recursive: true, force: true });
          purged++;
        }
      }

      return purged;
    },
  };
};
