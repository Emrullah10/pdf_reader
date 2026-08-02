import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const makeUploadMiddleware = ({ storageDir, maxUploadBytes }) => {
  const documentsDir = join(storageDir, 'documents');
  mkdirSync(documentsDir, { recursive: true });

  // Disk-backed rather than multer.memoryStorage(): a memory buffer holds the whole PDF in RAM
  // and then has to be written out with a blocking write, which stalls every other request this
  // single-process service is serving. Streaming to disk keeps upload memory flat regardless of
  // file size, and the file is already at its final path by the time the controller runs.
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, documentsDir),
    filename: (req, file, cb) => cb(null, `${randomUUID()}.pdf`),
  });

  return multer({
    storage,
    limits: { fileSize: maxUploadBytes },
    fileFilter: (req, file, cb) => {
      cb(null, file.mimetype === 'application/pdf');
    },
  }).single('file');
};
