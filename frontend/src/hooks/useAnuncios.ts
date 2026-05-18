import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { swrFetcher, swrMutator } from '@/lib/fetcher';

export interface AnunciosAccount {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  status: string;
  connected: boolean;
}

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

export interface AnunciosConnectUrl {
  authUrl?: string;
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

export function useAnunciosAccounts(platform?: string) {
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : '';
  const { data, isLoading, error, mutate } = useSWR<ApiListEnvelope<AnunciosAccount>>(
    `/api/anuncios/accounts${query}`,
    swrFetcher,
  );
  return {
    accounts: unwrapList(data),
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


export function useAnunciosConnectUrl(platform: string) {
  const { data, isLoading, error } = useSWR<AnunciosConnectUrl>(
    `/api/anuncios/connect/${platform}`,
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  return { connectData: data, isLoading, error };
}

export function useSyncAnunciosAccounts() {
  const { trigger, isMutating } = useSWRMutation<
    { success?: boolean },
    Error,
    string,
    { method?: string }
  >('/api/anuncios/sync/accounts', swrMutator);
  return { syncAccounts: () => trigger({ method: 'POST' }), isSyncing: isMutating };
}

export function useSyncAnunciosCampaigns() {
  const { trigger, isMutating } = useSWRMutation<
    { success?: boolean },
    Error,
    string,
    { method?: string }
  >('/api/anuncios/sync/campaigns', swrMutator);
  return { syncCampaigns: () => trigger({ method: 'POST' }), isSyncing: isMutating };
}
