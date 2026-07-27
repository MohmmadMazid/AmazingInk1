import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersApi } from './api.js';

export const useCustomers = (params) => useQuery({ queryKey: ['customers', params], queryFn: () => customersApi.list(params) });
export const useCustomerMetrics = (id) => useQuery({ queryKey: ['customer-metrics', id], queryFn: () => customersApi.metrics(id), enabled: !!id });
export const useDuplicates = () => useQuery({ queryKey: ['customer-duplicates'], queryFn: customersApi.duplicates });

export function useCustomerMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ['customers'] });
  return {
    create: useMutation({ mutationFn: customersApi.create, onSuccess: inv }),
    remove: useMutation({ mutationFn: customersApi.remove, onSuccess: inv }),
  };
}
