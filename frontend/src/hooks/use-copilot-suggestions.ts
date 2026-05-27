'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import type { CopilotSuggestionsResponse } from '@/lib/api/copilot';

export function useCopilotSuggestions(
  workspaceId: string | undefined,
  contactId: string | null,
) {
  const key =
    workspaceId && contactId
      ? `/copilot/suggest/${encodeURIComponent(workspaceId)}/${encodeURIComponent(contactId)}`
      : null;

  const { data, error, isLoading, mutate } = useSWR<CopilotSuggestionsResponse>(key, swrFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 30_000,
  });

  return {
    suggestions: data?.suggestions ?? [],
    context: data?.context,
    isLoading,
    error,
    mutate,
  };
}
