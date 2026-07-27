import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { warehouseApi } from './api.js';

export const useBins = (params) => useQuery({ queryKey: ['bins', params], queryFn: () => warehouseApi.bins(params) });
export const useReceipts = (params) => useQuery({ queryKey: ['receipts', params], queryFn: () => warehouseApi.receipts(params) });
export const usePickLists = (params) => useQuery({ queryKey: ['pick-lists', params], queryFn: () => warehouseApi.pickLists(params) });
export const usePickList = (id) => useQuery({ queryKey: ['pick-list', id], queryFn: () => warehouseApi.getPickList(id), enabled: !!id });
export const usePutawaySuggestions = (id) => useQuery({ queryKey: ['putaway', id], queryFn: () => warehouseApi.putawaySuggestions(id), enabled: !!id });

export function useWarehouseMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['receipts'] });
    qc.invalidateQueries({ queryKey: ['pick-lists'] });
    qc.invalidateQueries({ queryKey: ['pick-list'] });
    qc.invalidateQueries({ queryKey: ['inventory-levels'] });
  };
  return {
    createBin: useMutation({ mutationFn: warehouseApi.createBin, onSuccess: () => qc.invalidateQueries({ queryKey: ['bins'] }) }),
    receive: useMutation({ mutationFn: ({ id, body }) => warehouseApi.receive(id, body), onSuccess: inv }),
    confirmPutaway: useMutation({ mutationFn: ({ id, body }) => warehouseApi.confirmPutaway(id, body), onSuccess: inv }),
    createPickList: useMutation({ mutationFn: warehouseApi.createPickList, onSuccess: inv }),
    recordPick: useMutation({ mutationFn: ({ id, body }) => warehouseApi.recordPick(id, body), onSuccess: inv }),
  };
}
