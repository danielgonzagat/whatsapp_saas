'use client';

import InboxWorkspace from '@/components/kloel/inbox/InboxWorkspace';
import type { ChannelRealData, AIBrainInfo } from './MarketingTypes';
import { MarketingVisaoGeral } from './MarketingVisaoGeral';

export function MarketingConversationsHub({
  realStats,
  switchTab,
  channelDataMap,
  feedMsgs,
  realBrain,
  products,
}: {
  realStats: {
    totalMessages: number;
    totalLeads: number;
    totalSales: number;
    totalRevenue: number;
  };
  switchTab: (id: string) => void;
  channelDataMap: Record<string, ChannelRealData>;
  feedMsgs: string[];
  realBrain: AIBrainInfo | null;
  products: { name: string; price: number; sold: number; img: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <MarketingVisaoGeral
          realStats={realStats}
          switchTab={switchTab}
          channelDataMap={channelDataMap}
          feedMsgs={feedMsgs}
          realBrain={realBrain}
          products={products}
        />
      </section>

      <section>
        <InboxWorkspace embedded showHeader={false} showContextBanner={false} />
      </section>
    </div>
  );
}
