import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importsApi } from './api.js';

export const useImportColumns = () => useQuery({ queryKey: ['import-columns'], queryFn: importsApi.columns });

export function useImportMutations() {
  const qc = useQueryClient();
  return {
    preview: useMutation({ mutationFn: ({ csv, mapping }) => importsApi.preview(csv, mapping) }),
    commit: useMutation({
      mutationFn: ({ csv, mapping, applyStock }) => importsApi.commit(csv, mapping, applyStock),
      // A commit can change products, costs, stock, and channel prices.
      onSuccess: () => qc.invalidateQueries(),
    }),
  };
}
