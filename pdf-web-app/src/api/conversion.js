import { api } from '@shared/axios/axios-instance';

export const runOcrRequest = (documentId) => api.post(`/conversion/ocr/${documentId}`).then((res) => res.data);

export const renderPagesRequest = (documentId) =>
  api.post(`/conversion/pdf-to-images/${documentId}`).then((res) => res.data);

export const imageToPdfRequest = (files) => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }

  return api
    .post('/conversion/image-to-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    })
    .then((res) => res.data);
};
