import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { searchApi } from './api.js';

export const useGlobalSearch = (q) => useQuery({ queryKey: ['search-global', q], queryFn: () => searchApi.global(q), enabled: q.length >= 2 });
export const useEntitySearch = (entity, params) => useQuery({ queryKey: ['search-entity', entity, params], queryFn: () => searchApi.entity(entity, params), enabled: !!entity });
export const useSuggest = (q) => useQuery({ queryKey: ['search-suggest', q], queryFn: () => searchApi.suggest(q), enabled: q.length >= 2 });
export const useIndexStatus = () => useQuery({ queryKey: ['search-index'], queryFn: searchApi.indexStatus });
export const useSynonyms = () => useQuery({ queryKey: ['search-synonyms'], queryFn: searchApi.synonyms });
export const useSearchAnalytics = () => useQuery({ queryKey: ['search-analytics'], queryFn: () => searchApi.analytics() });

export function useSearchMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('search-') });
  return {
    rebuild: useMutation({ mutationFn: searchApi.rebuild, onSuccess: inv }),
    createSynonym: useMutation({ mutationFn: searchApi.createSynonym, onSuccess: inv }),
    removeSynonym: useMutation({ mutationFn: searchApi.removeSynonym, onSuccess: inv }),
  };
}
