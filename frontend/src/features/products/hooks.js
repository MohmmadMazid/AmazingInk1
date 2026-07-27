import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi } from './api.js';

export const useProducts = (params) => useQuery({ queryKey: ['products', params], queryFn: () => productsApi.list(params) });

export function useProductMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ['products'] });
  return {
    create: useMutation({ mutationFn: productsApi.create, onSuccess: inv }),
    remove: useMutation({ mutationFn: productsApi.remove, onSuccess: inv }),
  };
}
