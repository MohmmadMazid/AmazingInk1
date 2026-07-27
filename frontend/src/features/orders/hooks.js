import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from './api.js';

export const useOrders = (params) => useQuery({ queryKey: ['orders', params], queryFn: () => ordersApi.list(params) });

export function useOrderMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ['orders'] });
  return {
    create: useMutation({ mutationFn: ordersApi.create, onSuccess: inv }),
    setStatus: useMutation({ mutationFn: ({ id, status }) => ordersApi.setStatus(id, status), onSuccess: inv }),
  };
}
