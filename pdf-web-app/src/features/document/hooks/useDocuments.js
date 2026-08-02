import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDocumentRequest, getDocumentRequest, listDocumentsRequest, uploadDocumentRequest } from '@api/document';
import { queryKeys } from '@shared/constant/query-keys';

export const useDocumentsList = () =>
  useQuery({
    queryKey: queryKeys.documents,
    queryFn: listDocumentsRequest,
    select: (data) => data.documents,
  });

export const useDocument = (documentId, options = {}) =>
  useQuery({
    queryKey: queryKeys.document(documentId),
    queryFn: () => getDocumentRequest(documentId),
    select: (data) => data.document,
    enabled: Boolean(documentId),
    ...options,
  });

export const useUploadDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, onProgress }) => uploadDocumentRequest(file, { onProgress }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
  });
};

export const useDeleteDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDocumentRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
  });
};
