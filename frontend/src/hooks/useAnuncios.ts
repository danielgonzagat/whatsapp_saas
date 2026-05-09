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

export function useAnunciosStatus() {
  const { data, isLoading, error, mutate } = useSWR<AnunciosPlatformStatus[]>(
    '/api/anuncios/status',
    swrFetcher,
    { refreshInterval: 60000 },
  );
  return {
    statuses: data || [],
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useAnunciosAccounts(platform?: string) {
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : '';
  const { data, isLoading, error, mutate } = useSWR<AnunciosAccount[]>(
    `/api/anuncios/accounts${query}`,
    swrFetcher,
  );
  return {
    accounts: data || [],
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useAnunciosCampaigns(platform?: string) {
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : '';
  const { data, isLoading, error, mutate } = useSWR<AnunciosCampaign[]>(
    `/api/anuncios/campaigns${query}`,
    swrFetcher,
    { refreshInterval: 120000 },
  );
  return {
    campaigns: data || [],
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
  const { trigger, isMutating } = useSWRMutation<{ success?: boolean }>(
    '/api/anuncios/sync/accounts',
    swrMutator,
  );
  return { syncAccounts: () => trigger({ method: 'POST' }), isSyncing: isMutating };
}

export function useSyncAnunciosCampaigns() {
  const { trigger, isMutating } = useSWRMutation<{ success?: boolean }>(
    '/api/anuncios/sync/campaigns',
    swrMutator,
  );
  return { syncCampaigns: () => trigger({ method: 'POST' }), isSyncing: isMutating };
}
