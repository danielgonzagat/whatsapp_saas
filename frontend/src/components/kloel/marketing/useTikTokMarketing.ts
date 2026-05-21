'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import type { TikTokStatusData } from './MarketingTypes';

const TIKTOK_TRUSTED_HOSTS = ['www.tiktok.com', 'tiktok.com', 'business-api.tiktok.com'];

function isTrustedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && TIKTOK_TRUSTED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export interface UseTikTokMarketingReturn {
  tiktokStatus: TikTokStatusData | null;
  isConnected: boolean;
  isLoading: boolean;
  refreshStatus: () => Promise<void>;
  openTikTokConnect: (kind: 'creator' | 'advertiser') => Promise<void>;
}

export function useTikTokMarketing(): UseTikTokMarketingReturn {
  const { data: tiktokStatus, mutate, isLoading } = useSWR<TikTokStatusData>(
    '/marketing/connect/tiktok/status',
    swrFetcher,
  );

  const refreshStatus = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const openTikTokConnect = useCallback(async (kind: 'creator' | 'advertiser') => {
    const response = await apiFetch<{ url?: string }>(
      `/marketing/connect/tiktok/url?kind=${kind}`,
    );
    const url = String(response?.data?.url ?? '').trim();
    if (!url || !isTrustedUrl(url)) {
      throw new Error('URL oficial do TikTok indisponivel.');
    }
    window.location.assign(url);
  }, []);

  return {
    tiktokStatus: tiktokStatus ?? null,
    isConnected: tiktokStatus?.connected === true,
    isLoading,
    refreshStatus,
    openTikTokConnect,
  };
}
