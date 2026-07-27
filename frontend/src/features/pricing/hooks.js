import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pricingApi } from './api.js';

export const useRules = () => useQuery({ queryKey: ['pricing-rules'], queryFn: pricingApi.rules });
export const useCoupons = () => useQuery({ queryKey: ['coupons'], queryFn: pricingApi.coupons });
export const useQuote = (productId) => useQuery({ queryKey: ['pricing-quote', productId], queryFn: () => pricingApi.quote(productId), enabled: !!productId });

export function usePricingMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['pricing-rules'] });
    qc.invalidateQueries({ queryKey: ['pricing-quote'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };
  return {
    createRule: useMutation({ mutationFn: pricingApi.createRule, onSuccess: inv }),
    removeRule: useMutation({ mutationFn: pricingApi.removeRule, onSuccess: inv }),
    applyQuote: useMutation({ mutationFn: pricingApi.applyQuote, onSuccess: inv }),
    bulkApply: useMutation({ mutationFn: pricingApi.bulkApply, onSuccess: inv }),
    upsertPricing: useMutation({ mutationFn: ({ productId, body }) => pricingApi.upsertPricing(productId, body), onSuccess: inv }),
    validateCoupon: useMutation({ mutationFn: pricingApi.validateCoupon }),
  };
}
