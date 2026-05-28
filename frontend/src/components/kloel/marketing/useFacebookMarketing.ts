'use client';

import type {
  MarketingConnectStatus,
  FacebookChannelConnection,
} from './MarketingTypes';

export interface UseFacebookMarketingReturn {
  channelSession: FacebookChannelConnection | undefined;
  isConnected: boolean;
}

export function useFacebookMarketing(
  connectionStatus?: MarketingConnectStatus | null,
): UseFacebookMarketingReturn {
  return {
    channelSession: connectionStatus?.channels?.facebook,
    isConnected: connectionStatus?.channels?.facebook?.connected === true,
  };
}
