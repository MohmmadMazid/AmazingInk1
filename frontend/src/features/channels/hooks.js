import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { channelsApi } from './api.js';

export const usePlatforms = () => useQuery({ queryKey: ['ch-platforms'], queryFn: channelsApi.platforms });
export const useConnections = () => useQuery({ queryKey: ['ch-connections'], queryFn: channelsApi.connections });
export const useProfiles = (connectionId) => useQuery({ queryKey: ['ch-profiles', connectionId], queryFn: () => channelsApi.profiles(connectionId) });
export const usePriceMatrix = (productId) => useQuery({ queryKey: ['ch-matrix', productId], queryFn: () => channelsApi.priceMatrix(productId), enabled: !!productId, retry: false });
export const useChannelListings = () => useQuery({ queryKey: ['ch-listings'], queryFn: () => channelsApi.listings({}) });

export function useChannelMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('ch-') });
  return {
    createConnection: useMutation({ mutationFn: channelsApi.createConnection, onSuccess: inv }),
    testConnection: useMutation({ mutationFn: channelsApi.testConnection, onSuccess: inv }),
    removeConnection: useMutation({ mutationFn: channelsApi.removeConnection, onSuccess: inv }),
    upsertProfile: useMutation({ mutationFn: channelsApi.upsertProfile, onSuccess: inv }),
    publish: useMutation({ mutationFn: channelsApi.publish, onSuccess: inv }),
    propagate: useMutation({ mutationFn: ({ productId, force }) => channelsApi.propagate(productId, force), onSuccess: inv }),
    propagateAll: useMutation({ mutationFn: channelsApi.propagateAll, onSuccess: inv }),
    drain: useMutation({ mutationFn: channelsApi.drain, onSuccess: inv }),
    refresh: useMutation({ mutationFn: channelsApi.refresh, onSuccess: inv }),
  };
}
