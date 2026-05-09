'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import type {
  MarketingConnectStatus,
  IgProfileData,
  IgInsightsData,
  InstagramChannelConnection,
} from './MarketingTypes';

export interface UseInstagramMarketingReturn {
  igProfile: IgProfileData | null;
  igInsights: IgInsightsData | null;
  connection: InstagramChannelConnection | undefined;
  isConnected: boolean;
}

export function useInstagramMarketing(
  connectionStatus?: MarketingConnectStatus | null,
): UseInstagramMarketingReturn {
  const isConnected = connectionStatus?.channels?.instagram?.connected === true;

  const { data: igProfile } = useSWR<IgProfileData>(
    isConnected ? '/meta/instagram/profile' : null,
    swrFetcher,
  );

  const { data: igInsights } = useSWR<IgInsightsData>(
    isConnected ? '/meta/instagram/insights/account' : null,
    swrFetcher,
  );

  return {
    igProfile: igProfile ?? null,
    igInsights: igInsights ?? null,
    connection: connectionStatus?.channels?.instagram,
    isConnected,
  };
}
