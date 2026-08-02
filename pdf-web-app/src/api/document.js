import { api } from '@shared/axios/axios-instance';

// Cloudflare rejects request bodies over 100MB, and buffering a large file server-side is what
// used to exhaust memory, so anything sizeable goes up in chunks instead of as one body.
const CHUNK_SIZE = 5 * 1024 * 1024;
// Below this a single request is simpler and saves two round trips; above it, chunk.
const CHUNKED_THRESHOLD = 20 * 1024 * 1024;

const uploadWholeFile = (file, { onProgress } = {}) => {
  const formData = new FormData();
  formData.append('file', file);

  return api
    .post('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    })
    .then((res) => res.data);
};

const uploadInChunks = async (file, { onProgress, signal } = {}) => {
  const { data: created } = await api.post('/documents/uploads', {
    originalName: file.name,
    mime: file.type,
    totalBytes: file.size,
  });

  const uploadId = created.upload.id;
  let offset = created.upload.receivedBytes;

  try {
    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));

      let response;
      try {
        response = await api.patch(`/documents/uploads/${uploadId}`, chunk, {
          headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-Offset': String(offset) },
          signal,
        });
      } catch (err) {
        // The server rejects a chunk whose offset doesn't match what it actually holds — which is
        // what happens when a retry duplicates a chunk that landed. Resync and continue rather
        // than failing an upload that is mostly done.
        const serverOffset = err.response?.status === 409 ? err.response?.data?.upload?.receivedBytes : null;
        if (typeof serverOffset !== 'number') throw err;
        offset = serverOffset;
        continue;
      }

      // The final chunk's response carries the created document instead of upload progress.
      if (response.data.document) {
        onProgress?.(100);
        return response.data;
      }

      offset = response.data.upload.receivedBytes;
      onProgress?.(Math.round((offset / file.size) * 100));
    }

    throw new Error('Upload finished without the server returning a document');
  } catch (err) {
    // Abandoned sessions are swept server-side eventually, but releasing the partial file now
    // matters on a small host.
    api.delete(`/documents/uploads/${uploadId}`).catch(() => {});
    throw err;
  }
};

export const uploadDocumentRequest = (file, options = {}) =>
  file.size > CHUNKED_THRESHOLD ? uploadInChunks(file, options) : uploadWholeFile(file, options);

export const listDocumentsRequest = () => api.get('/documents').then((res) => res.data);

export const getDocumentRequest = (documentId) => api.get(`/documents/${documentId}`).then((res) => res.data);

export const searchDocumentsRequest = ({ query, documentIds = [] }) =>
  api.post('/documents/search', { query, documentIds }).then((res) => res.data);

export const deleteDocumentRequest = (documentId) => api.delete(`/documents/${documentId}`).then((res) => res.data);
