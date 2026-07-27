import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from './api.js';

export const useLevels = (params) => useQuery({ queryKey: ['inventory-levels', params], queryFn: () => inventoryApi.levels(params) });
export const useWarehouses = () => useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.warehouses });
export const useReorderReport = () => useQuery({ queryKey: ['reorder-report'], queryFn: inventoryApi.reorderReport });

export function useInventoryMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['inventory-levels'] });
    qc.invalidateQueries({ queryKey: ['reorder-report'] });
  };
  return {
    adjust: useMutation({ mutationFn: inventoryApi.adjust, onSuccess: inv }),
    reserve: useMutation({ mutationFn: inventoryApi.reserve, onSuccess: inv }),
  };
}
