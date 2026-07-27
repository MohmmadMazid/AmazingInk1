import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { automationApi } from './api.js';

export const useMonitoring = () => useQuery({ queryKey: ['auto-monitoring'], queryFn: automationApi.monitoring, refetchInterval: 5000 });
export const useHandlers = () => useQuery({ queryKey: ['auto-handlers'], queryFn: automationApi.handlers });
export const useRuns = (params) => useQuery({ queryKey: ['auto-runs', params], queryFn: () => automationApi.runs(params), refetchInterval: 4000 });
export const useSchedules = () => useQuery({ queryKey: ['auto-schedules'], queryFn: automationApi.schedules });
export const useRules = () => useQuery({ queryKey: ['auto-rules'], queryFn: automationApi.rules });
export const useWorkflows = () => useQuery({ queryKey: ['auto-workflows'], queryFn: automationApi.workflows });
export const useWorkflowRuns = () => useQuery({ queryKey: ['auto-wf-runs'], queryFn: automationApi.workflowRuns });

export function useAutomationMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('auto-') });
  return {
    enqueue: useMutation({ mutationFn: ({ jobKey, payload }) => automationApi.enqueue(jobKey, payload), onSuccess: inv }),
    retryRun: useMutation({ mutationFn: automationApi.retryRun, onSuccess: inv }),
    upsertSchedule: useMutation({ mutationFn: automationApi.upsertSchedule, onSuccess: inv }),
    removeSchedule: useMutation({ mutationFn: automationApi.removeSchedule, onSuccess: inv }),
    tick: useMutation({ mutationFn: automationApi.tick, onSuccess: inv }),
    testRule: useMutation({ mutationFn: ({ id, payload }) => automationApi.testRule(id, payload) }),
    emit: useMutation({ mutationFn: ({ event, payload }) => automationApi.emit(event, payload), onSuccess: inv }),
    runWorkflow: useMutation({ mutationFn: ({ id, payload }) => automationApi.runWorkflow(id, payload), onSuccess: inv }),
    pause: useMutation({ mutationFn: automationApi.pause, onSuccess: inv }),
    resume: useMutation({ mutationFn: automationApi.resume, onSuccess: inv }),
  };
}
