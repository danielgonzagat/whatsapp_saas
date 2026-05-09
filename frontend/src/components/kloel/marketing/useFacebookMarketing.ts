'use client';

import type { MarketingConnectStatus } from './MarketingTypes';

export interface UseFacebookMarketingReturn {
  connection: MarketingConnectStatus['channels'] extends { facebook?: infer T } ? T : undefined;
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
