import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import type { AnunciosCampaign } from './useAnuncios';

type ApiArrayEnvelope<T> = { data?: T[] };

function unwrapApiArray<T>(value: T[] | ApiArrayEnvelope<T> | null | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object' && Array.isArray((value as ApiArrayEnvelope<T>).data)) {
    return (value as ApiArrayEnvelope<T>).data ?? [];
  }

  return [];
}

export interface MetaSyncStatus {
  connected: boolean;
  adAccountId: string | null;
  lastAccountSync: string | null;
  lastCampaignSync: string | null;
}

export interface MetaMarketingSyncStatus {
  workspaceId: string;
  meta: MetaSyncStatus;
}

export function useAnunciosCampaigns(platform?: string) {
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : '';
  const { data, isLoading, error, mutate } = useSWR<
    AnunciosCampaign[] | ApiArrayEnvelope<AnunciosCampaign>
  >(`/api/anuncios/campaigns${query}`, swrFetcher, { refreshInterval: 120000 });
  return {
    campaigns: unwrapApiArray<AnunciosCampaign>(data),
    isLoading,
    error,
    refresh: mutate,
  };
}


export function useMetaMarketingSyncStatus() {
  const { data, isLoading, error, mutate } = useSWR<MetaMarketingSyncStatus>(
    '/api/anuncios/sync-status/meta',
    swrFetcher,
    { refreshInterval: 60000 },
  );
  return {
    syncStatus: data,
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useMetaMarketingConnectUrl() {
  const { data, isLoading, error } = useSWR<{ authUrl?: string }>(
    '/api/anuncios/connect/meta',
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  return { connectData: data, isLoading, error };
}
