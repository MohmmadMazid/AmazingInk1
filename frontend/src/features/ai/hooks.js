import { useMutation, useQuery } from '@tanstack/react-query';
import { aiApi } from './api.js';

export const useProviders = () => useQuery({ queryKey: ['ai-providers'], queryFn: aiApi.providers });
export const useAiUsage = () => useQuery({ queryKey: ['ai-usage'], queryFn: () => aiApi.usage() });
export const useAiCalls = () => useQuery({ queryKey: ['ai-calls'], queryFn: aiApi.calls });
export const usePrompts = () => useQuery({ queryKey: ['ai-prompts'], queryFn: aiApi.prompts });
export const useForecast = (id) => useQuery({ queryKey: ['ai-forecast', id], queryFn: () => aiApi.forecast(id), enabled: !!id });
export const useDuplicates = (id) => useQuery({ queryKey: ['ai-dupes', id], queryFn: () => aiApi.duplicates(id), enabled: !!id });

export function useAiMutations() {
  return {
    description: useMutation({ mutationFn: aiApi.description }),
    keywords: useMutation({ mutationFn: aiApi.keywords }),
    priceSuggestion: useMutation({ mutationFn: ({ id, params }) => aiApi.priceSuggestion(id, params) }),
    insights: useMutation({ mutationFn: aiApi.insights }),
    runPrompt: useMutation({ mutationFn: ({ key, vars }) => aiApi.runPrompt(key, vars) }),
  };
}
