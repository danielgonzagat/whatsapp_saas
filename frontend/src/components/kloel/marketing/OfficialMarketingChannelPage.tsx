'use client';

import type { ChannelKey } from './OfficialMarketingChannelPage.helpers';
import { ChannelOnboarding } from './OfficialMarketingChannelPage/ChannelOnboarding';

interface Props {
  channel: ChannelKey;
  initialStep?: number;
}

/**
 * The canonical Marketing channel screen. Every one of the five channels
 * (WhatsApp · Instagram · TikTok · Facebook · Email) renders this single
 * component — the four-step onboarding diamond defined by the Marketing
 * specification. No proof pills, no raw JSON, no legacy per-channel tab:
 * just the pill, the four-trace step bar, the evolving glyph and the
 * step vignette, all bound to real backend state.
 */
export function OfficialMarketingChannelPage({ channel, initialStep }: Props) {
  return (
    <ChannelOnboarding
      channel={channel}
      {...(initialStep !== undefined ? { initialStep } : {})}
    />
  );
}
