'use client';

import type {
  MarketingConnectStatus,
  FacebookChannelConnection,
} from './MarketingTypes';

export interface UseFacebookMarketingReturn {
  connection: FacebookChannelConnection | undefined;
  isConnected: boolean;
}

export function useFacebookMarketing(
  connectionStatus?: MarketingConnectStatus | null,
): UseFacebookMarketingReturn {
  return {
    connection: connectionStatus?.channels?.facebook,
    isConnected: connectionStatus?.channels?.facebook?.connected === true,
  };
}
