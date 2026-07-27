import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shippingApi } from './api.js';

export const usePackages = () => useQuery({ queryKey: ['ship-packages'], queryFn: shippingApi.packages });
export const useCarrierRules = () => useQuery({ queryKey: ['ship-rules'], queryFn: shippingApi.rules });
export const useShipments = (params) => useQuery({ queryKey: ['shipments', params], queryFn: () => shippingApi.shipments(params) });

export function useShippingMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['shipments'] });
    qc.invalidateQueries({ queryKey: ['ship-rules'] });
  };
  return {
    shopRates: useMutation({ mutationFn: shippingApi.shopRates }),
    refresh: useMutation({ mutationFn: shippingApi.refresh, onSuccess: inv }),
    createRule: useMutation({ mutationFn: shippingApi.createRule, onSuccess: inv }),
    removeRule: useMutation({ mutationFn: shippingApi.removeRule, onSuccess: inv }),
  };
}
