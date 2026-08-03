import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDocumentRequest, getDocumentRequest, listDocumentsRequest, uploadDocumentRequest } from '@api/document';
import { queryKeys } from '@shared/constant/query-keys';

export const useDocumentsList = () =>
  useQuery({
    queryKey: queryKeys.documents,
    queryFn: listDocumentsRequest,
    select: (data) => data.documents,
    // Poll while any document is still processing so the list's progress ("İşleniyor… 12/50")
    // and status badge update live, the same way the reader page already does per-document.
    refetchInterval: (query) =>
      query.state.data?.documents?.some((doc) => doc.status === 'processing') ? 1500 : false,
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
