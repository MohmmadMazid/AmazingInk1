import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { securityApi } from './api.js';

export const useSecDashboard = () => useQuery({ queryKey: ['sec-dashboard'], queryFn: securityApi.dashboard, refetchInterval: 10000 });
export const useSecEvents = (params) => useQuery({ queryKey: ['sec-events', params], queryFn: () => securityApi.events(params) });
export const useSessions = () => useQuery({ queryKey: ['sec-sessions'], queryFn: securityApi.sessions });
export const useIpAllowlist = () => useQuery({ queryKey: ['sec-ips'], queryFn: securityApi.ipAllowlist });
export const useRetention = () => useQuery({ queryKey: ['sec-retention'], queryFn: securityApi.retention });
export const useGdpr = () => useQuery({ queryKey: ['sec-gdpr'], queryFn: securityApi.gdpr });
export const useControls = (framework) => useQuery({ queryKey: ['sec-controls', framework], queryFn: () => securityApi.controls(framework) });
export const useReport = (framework) => useQuery({ queryKey: ['sec-report', framework], queryFn: () => securityApi.report(framework), enabled: !!framework });

export function useSecurityMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('sec-') });
  return {
    revokeSession: useMutation({ mutationFn: securityApi.revokeSession, onSuccess: inv }),
    revokeAll: useMutation({ mutationFn: securityApi.revokeAll, onSuccess: inv }),
    clearLockout: useMutation({ mutationFn: securityApi.clearLockout, onSuccess: inv }),
    addIp: useMutation({ mutationFn: securityApi.addIp, onSuccess: inv }),
    removeIp: useMutation({ mutationFn: securityApi.removeIp, onSuccess: inv }),
    upsertRetention: useMutation({ mutationFn: securityApi.upsertRetention, onSuccess: inv }),
    runRetention: useMutation({ mutationFn: securityApi.runRetention, onSuccess: inv }),
    createGdpr: useMutation({ mutationFn: securityApi.createGdpr, onSuccess: inv }),
    processAccess: useMutation({ mutationFn: securityApi.processAccess, onSuccess: inv }),
    processErasure: useMutation({ mutationFn: ({ id, dryRun }) => securityApi.processErasure(id, dryRun), onSuccess: inv }),
    seedFramework: useMutation({ mutationFn: securityApi.seedFramework, onSuccess: inv }),
    updateControl: useMutation({ mutationFn: ({ id, body }) => securityApi.updateControl(id, body), onSuccess: inv }),
  };
}
