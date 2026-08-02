import { useMutation, useQueryClient } from '@tanstack/react-query';
import { imageToPdfRequest, runOcrRequest } from '@api/conversion';
import { queryKeys } from '@shared/constant/query-keys';

export const useRunOcr = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runOcrRequest,
    onSuccess: (_data, documentId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.document(documentId) });
    },
  });
};

export const useImageToPdf = () =>
  useMutation({
    mutationFn: imageToPdfRequest,
  });
