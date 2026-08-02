import { api } from '@shared/axios/axios-instance';

export const uploadDocumentRequest = (file, { onProgress } = {}) => {
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

export const listDocumentsRequest = () => api.get('/documents').then((res) => res.data);

export const getDocumentRequest = (documentId) => api.get(`/documents/${documentId}`).then((res) => res.data);

export const searchDocumentsRequest = ({ query, documentIds = [] }) =>
  api.post('/documents/search', { query, documentIds }).then((res) => res.data);

export const deleteDocumentRequest = (documentId) => api.delete(`/documents/${documentId}`).then((res) => res.data);
