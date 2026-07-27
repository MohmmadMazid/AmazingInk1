import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from './api.js';

export const useInbox = (params) => useQuery({ queryKey: ['notif-inbox', params], queryFn: () => notificationsApi.inbox(params), refetchInterval: 15000 });
export const useNotifSettings = () => useQuery({ queryKey: ['notif-settings'], queryFn: notificationsApi.settings });
export const useTemplates = () => useQuery({ queryKey: ['notif-templates'], queryFn: notificationsApi.templates });
export const useDigest = () => useQuery({ queryKey: ['notif-digest'], queryFn: notificationsApi.digest });
export const useProviderOutbox = () => useQuery({ queryKey: ['notif-outbox'], queryFn: notificationsApi.providerOutbox, refetchInterval: 10000 });

export function useNotifMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('notif-') });
  return {
    markRead: useMutation({ mutationFn: notificationsApi.markRead, onSuccess: inv }),
    markAllRead: useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: inv }),
    updateSettings: useMutation({ mutationFn: notificationsApi.updateSettings, onSuccess: inv }),
    emit: useMutation({ mutationFn: notificationsApi.emit, onSuccess: inv }),
  };
}
