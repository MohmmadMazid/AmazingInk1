import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devApi } from './api.js';

export const useKeys = () => useQuery({ queryKey: ['dev-keys'], queryFn: devApi.keys });
export const useClients = () => useQuery({ queryKey: ['dev-clients'], queryFn: devApi.clients });
export const useSubscriptions = () => useQuery({ queryKey: ['dev-subs'], queryFn: devApi.subscriptions });
export const useDeliveries = (params) => useQuery({ queryKey: ['dev-deliveries', params], queryFn: () => devApi.deliveries(params), refetchInterval: 8000 });
export const useUsage = () => useQuery({ queryKey: ['dev-usage'], queryFn: () => devApi.usage() });
export const useQuota = (tier) => useQuery({ queryKey: ['dev-quota', tier], queryFn: () => devApi.quota(tier) });
export const useVersions = () => useQuery({ queryKey: ['dev-versions'], queryFn: devApi.versions });
export const useOpenApi = () => useQuery({ queryKey: ['dev-openapi'], queryFn: devApi.openapi });
export const useSdk = () => useQuery({ queryKey: ['dev-sdk'], queryFn: devApi.sdk });
export const useEventCatalog = () => useQuery({ queryKey: ['dev-events'], queryFn: devApi.events });

export function useDevMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('dev-') });
  return {
    createKey: useMutation({ mutationFn: devApi.createKey, onSuccess: inv }),
    revokeKey: useMutation({ mutationFn: devApi.revokeKey, onSuccess: inv }),
    createClient: useMutation({ mutationFn: devApi.createClient, onSuccess: inv }),
    removeClient: useMutation({ mutationFn: devApi.removeClient, onSuccess: inv }),
    createSubscription: useMutation({ mutationFn: devApi.createSubscription, onSuccess: inv }),
    removeSubscription: useMutation({ mutationFn: devApi.removeSubscription, onSuccess: inv }),
    drain: useMutation({ mutationFn: devApi.drain, onSuccess: inv }),
    redeliver: useMutation({ mutationFn: devApi.redeliver, onSuccess: inv }),
    testEvent: useMutation({ mutationFn: devApi.testEvent, onSuccess: inv }),
    seedVersions: useMutation({ mutationFn: devApi.seedVersions, onSuccess: inv }),
  };
}
