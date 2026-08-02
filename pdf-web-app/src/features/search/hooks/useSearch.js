import { useMutation } from '@tanstack/react-query';
import { searchDocumentsRequest } from '@api/document';

export const useSearchDocuments = () =>
  useMutation({
    mutationFn: searchDocumentsRequest,
  });
