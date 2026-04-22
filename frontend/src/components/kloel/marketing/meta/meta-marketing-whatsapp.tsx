'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { ActionButton, FeedCard, InfoCard, MetricCard, StatusBadge } from './meta-marketing-cards';
import type {
  ChannelRealData,
  MarketingConnectStatus,
  MetaLiveFeedMessage,
} from './meta-marketing.helpers';

export function WhatsAppMetaMarketingSurface({
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
  const whatsapp = connectionStatus?.channels?.whatsapp;
  const connected = Boolean(whatsapp?.connected);
  const pushName = whatsapp?.pushName || 'Canal oficial do workspace';
  const phoneNumber = whatsapp?.phoneNumber || 'Aguardando número oficial';
  const phoneNumberId = whatsapp?.phoneNumberId || 'Pendente';
  const wabaId = whatsapp?.whatsappBusinessId || 'Pendente';

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
              Conexão oficial Meta Cloud API
            </div>
            <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 14, lineHeight: 1.7 }}>
              Sem QR Code, sem sessão browser, sem WAHA exposto e com estado persistido por
              workspace.
            </div>
          </div>
          <StatusBadge status={whatsapp?.status} connected={connected} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ActionButton disabled={busy !== null} onClick={onConnect}>
            {connected ? 'Reconectar Meta' : 'Conectar com Meta'}
          </ActionButton>
          <ActionButton secondary disabled={busy !== null} onClick={onRefresh}>
            Atualizar estado
          </ActionButton>
          <ActionButton secondary disabled={!connectionStatus?.meta?.connected || busy !== null} onClick={onDisconnect}>
            Desconectar
          </ActionButton>
        </div>

        {whatsapp?.degradedReason ? (
          <div
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              color: KLOEL_THEME.textPrimary,
              border: `1px solid ${KLOEL_THEME.accent}33`,
              background: `${KLOEL_THEME.accent}12`,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Motivo atual de degradação: {whatsapp.degradedReason}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <InfoCard label="Perfil" value={pushName} />
        <InfoCard label="Telefone oficial" value={phoneNumber} />
        <InfoCard label="Phone Number ID" value={phoneNumberId} />
        <InfoCard label="WhatsApp Business ID" value={wabaId} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <MetricCard label="Mensagens" value={channelData.messages} />
        <MetricCard label="Leads" value={channelData.leads} />
        <MetricCard label="Vendas" value={channelData.sales} />
      </div>

      <FeedCard messages={feed} />
    </div>
  );
}
