'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { ActionButton, FeedCard, InfoCard, MetricCard, StatusBadge } from './meta-marketing-cards';
import type {
  ChannelRealData,
  MarketingConnectStatus,
  MetaLiveFeedMessage,
} from './meta-marketing.helpers';

export function FacebookMetaMarketingSurface({
  connectionStatus,
  channelData,
  feed,
  busy,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  connectionStatus: MarketingConnectStatus | null;
  channelData: ChannelRealData;
  feed: MetaLiveFeedMessage[];
  busy: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  const facebook = connectionStatus?.channels?.facebook;
  const connected = Boolean(facebook?.connected);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gap: 16,
          padding: 18,
          borderRadius: 18,
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          background: KLOEL_THEME.bgSecondary,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              Facebook Messenger oficial
            </div>
            <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 14, lineHeight: 1.7 }}>
              Page vinculada por workspace, com inbound e outbound honestos dentro do escopo
              oficial do Messenger.
            </div>
          </div>
          <StatusBadge status={facebook?.status} connected={connected} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ActionButton disabled={busy !== null} onClick={onConnect}>
            {connected ? 'Reconectar Messenger' : 'Conectar Messenger'}
          </ActionButton>
          <ActionButton secondary disabled={busy !== null} onClick={onRefresh}>
            Atualizar estado
          </ActionButton>
          <ActionButton secondary disabled={!connectionStatus?.meta?.connected || busy !== null} onClick={onDisconnect}>
            Desconectar Meta
          </ActionButton>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <InfoCard label="Page name" value={facebook?.pageName || connectionStatus?.meta?.pageName || 'Pendente'} />
        <InfoCard label="Page ID" value={facebook?.pageId || connectionStatus?.meta?.pageId || 'Pendente'} />
        <InfoCard label="Webhook base" value="/webhooks/meta" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <MetricCard label="Mensagens" value={channelData.messages} />
        <MetricCard label="Leads" value={channelData.leads} />
        <MetricCard label="Vendas" value={channelData.sales} />
      </div>

      <FeedCard messages={feed} />
      <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 12, lineHeight: 1.7 }}>
        Se a Meta não conceder `pages_messaging`, a Page pode até aparecer conectada, mas o
        Messenger ainda fica bloqueado para certificação final de produção.
      </div>
    </div>
  );
}
