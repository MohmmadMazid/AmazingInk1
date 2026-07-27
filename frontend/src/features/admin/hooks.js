import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './api.js';

export const useAudit = (params) => useQuery({ queryKey: ['admin-audit', params], queryFn: () => adminApi.audit(params) });
export const useCredentials = () => useQuery({ queryKey: ['admin-creds'], queryFn: adminApi.credentials });
export const useWebhooks = () => useQuery({ queryKey: ['admin-hooks'], queryFn: adminApi.webhooks });
export const useFlags = () => useQuery({ queryKey: ['admin-flags'], queryFn: adminApi.flags });
export const useEvaluatedFlags = () => useQuery({ queryKey: ['admin-flags-eval'], queryFn: adminApi.evaluateFlags });
export const useRoles = () => useQuery({ queryKey: ['admin-roles'], queryFn: adminApi.roles });
export const usePermissionCatalog = () => useQuery({ queryKey: ['admin-perms'], queryFn: adminApi.permissions });
export const useAdminUsers = () => useQuery({ queryKey: ['admin-users'], queryFn: adminApi.users });
export const useCurrencies = () => useQuery({ queryKey: ['admin-currencies'], queryFn: adminApi.currencies });
export const useCurrency = () => useQuery({ queryKey: ['admin-currency'], queryFn: adminApi.currency });

export function useAdminMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin-') });
  return {
    createCredential: useMutation({ mutationFn: adminApi.createCredential, onSuccess: inv }),
    revokeCredential: useMutation({ mutationFn: adminApi.revokeCredential, onSuccess: inv }),
    createWebhook: useMutation({ mutationFn: adminApi.createWebhook, onSuccess: inv }),
    removeWebhook: useMutation({ mutationFn: adminApi.removeWebhook, onSuccess: inv }),
    testWebhook: useMutation({ mutationFn: adminApi.testWebhook, onSuccess: inv }),
    upsertFlag: useMutation({ mutationFn: adminApi.upsertFlag, onSuccess: inv }),
    upsertRole: useMutation({ mutationFn: adminApi.upsertRole, onSuccess: inv }),
    checkPassword: useMutation({ mutationFn: adminApi.checkPassword }),
    setCurrency: useMutation({ mutationFn: adminApi.setCurrency, onSuccess: () => window.location.reload() }),
  };
}
