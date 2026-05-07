'use client';

import MarketingView from './MarketingView';
import type { ChannelKey } from './OfficialMarketingChannelPage.helpers';

interface Props {
  channel: ChannelKey;
}

export function OfficialMarketingChannelPage({ channel }: Props) {
  return <MarketingView defaultTab={channel} />;
}
