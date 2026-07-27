import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from './api.js';

export const useDashboard = (params) => useQuery({ queryKey: ['an-dashboard', params], queryFn: () => analyticsApi.dashboard(params) });
export const usePnl = (params) => useQuery({ queryKey: ['an-pnl', params], queryFn: () => analyticsApi.pnl(params) });
export const useByChannel = (params) => useQuery({ queryKey: ['an-channel', params], queryFn: () => analyticsApi.byChannel(params) });
export const useTopProducts = (params) => useQuery({ queryKey: ['an-products', params], queryFn: () => analyticsApi.topProducts(params) });
export const useInventoryValuation = () => useQuery({ queryKey: ['an-inventory'], queryFn: analyticsApi.inventoryValuation });

export function useAnalyticsMutations() {
  const qc = useQueryClient();
  return {
    rebuild: useMutation({
      mutationFn: analyticsApi.rebuildRollups,
      onSuccess: () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('an-') }),
    }),
  };
}
