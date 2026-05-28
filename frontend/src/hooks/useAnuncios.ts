import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export interface AnunciosCampaign {
  id: string;
  platform: string;
  accountId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

export interface AnunciosPlatformStatus {
  platform: string;
  connected: boolean;
  status: string;
  accountId?: string;
  clientConfigured: boolean;
}

type ApiListEnvelope<T> = T[] | { data?: T[] } | null;

function unwrapList<T>(value: ApiListEnvelope<T> | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
}

export function useAnunciosStatus() {
  const { data, isLoading, error, mutate } = useSWR<ApiListEnvelope<AnunciosPlatformStatus>>(
    '/api/anuncios/status',
    swrFetcher,
    { refreshInterval: 60000 },
  );
  return {
    statuses: unwrapList(data),
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useAnunciosCampaigns(platform?: string) {
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : '';
  const { data, isLoading, error, mutate } = useSWR<ApiListEnvelope<AnunciosCampaign>>(
    `/api/anuncios/campaigns${query}`,
    swrFetcher,
    { refreshInterval: 120000 },
  );
  return {
    campaigns: unwrapList(data),
    isLoading,
    error,
    refresh: mutate,
  };
}


