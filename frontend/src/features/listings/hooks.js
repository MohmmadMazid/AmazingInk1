import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listingsApi } from './api.js';

export const useChannels = () => useQuery({ queryKey: ['channels'], queryFn: listingsApi.channels });
export const useListings = (params) => useQuery({ queryKey: ['listings', params], queryFn: () => listingsApi.listings(params) });
export const useOutbox = (params) => useQuery({ queryKey: ['outbox', params], queryFn: () => listingsApi.outbox(params), refetchInterval: 5000 });
export const useConflicts = () => useQuery({ queryKey: ['conflicts'], queryFn: listingsApi.conflicts });

export function useListingMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['listings'] });
    qc.invalidateQueries({ queryKey: ['outbox'] });
    qc.invalidateQueries({ queryKey: ['conflicts'] });
  };
  return {
    publish: useMutation({ mutationFn: listingsApi.publish, onSuccess: inv }),
    sync: useMutation({ mutationFn: listingsApi.sync, onSuccess: inv }),
    syncAll: useMutation({ mutationFn: listingsApi.syncAll, onSuccess: inv }),
    drain: useMutation({ mutationFn: listingsApi.drain, onSuccess: inv }),
  };
}
