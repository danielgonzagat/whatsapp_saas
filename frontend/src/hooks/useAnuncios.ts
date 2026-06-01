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

type ApiListEnvelope<T> = T[] | { data?: unknown } | null;

type ListResult<T> = { items: T[]; payloadError?: Error };

function unwrapList<T>(value: ApiListEnvelope<T> | undefined, message: string): ListResult<T> {
  if (value === undefined || value === null) {
    return { items: [] };
  }

  if (Array.isArray(value)) {
    return { items: value };
  }

  if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'data')) {
    if (Array.isArray(value.data)) {
      return { items: value.data as T[] };
    }
    return { items: [], payloadError: new Error(message) };
  }

  return { items: [], payloadError: new Error(message) };
}

export function useAnunciosStatus() {
  const { data, isLoading, error, mutate } = useSWR<ApiListEnvelope<AnunciosPlatformStatus>>(
    '/api/anuncios/status',
    swrFetcher,
    { refreshInterval: 60000 },
  );
  const { items: statuses, payloadError } = unwrapList<AnunciosPlatformStatus>(
    data,
    'Invalid anuncios status payload',
  );
  return {
    statuses,
    isLoading,
    error: error ?? payloadError,
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
  const { items: campaigns, payloadError } = unwrapList<AnunciosCampaign>(
    data,
    'Invalid anuncios campaigns payload',
  );
  return {
    campaigns,
    isLoading,
    error: error ?? payloadError,
    refresh: mutate,
  };
}


