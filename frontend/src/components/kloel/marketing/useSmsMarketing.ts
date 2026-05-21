'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

interface SmsChannelStatus {
  connected?: boolean;
  status?: string;
  providerAvailable?: boolean;
  provider?: string;
}

export interface UseSmsMarketingReturn {
  smsStatus: SmsChannelStatus | null;
  isConnected: boolean;
  isConfigured: boolean;
  isLoading: boolean;
}

export function useSmsMarketing(): UseSmsMarketingReturn {
  const { data: smsStatus, isLoading } = useSWR<SmsChannelStatus>(
    '/marketing/connect/status',
    swrFetcher,
  );

  const smsChannel = smsStatus as SmsChannelStatus | null;

  return {
    smsStatus: smsChannel,
    isConnected: smsChannel?.connected === true,
    isConfigured: smsChannel?.providerAvailable === true,
    isLoading,
  };
}
