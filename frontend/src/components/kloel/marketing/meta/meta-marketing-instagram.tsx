'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { ActionButton, FeedCard, InfoCard, MetricCard, StatusBadge } from './meta-marketing-cards';
import type {
  ChannelRealData,
  InstagramInsightsData,
  InstagramProfileData,
  MarketingConnectStatus,
  MetaLiveFeedMessage,
} from './meta-marketing.helpers';

export function InstagramMetaMarketingSurface({
  connectionStatus,
  profile,
  insights,
  channelData,
  feed,
  busy,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  connectionStatus: MarketingConnectStatus | null;
  profile: InstagramProfileData | null;
  insights: InstagramInsightsData | null;
  channelData: ChannelRealData;
  feed: MetaLiveFeedMessage[];
  busy: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  const instagram = connectionStatus?.channels?.instagram;
  const connected = Boolean(instagram?.connected);
  const followers = profile?.followers ?? profile?.followersCount ?? profile?.followers_count ?? 0;
  const posts = profile?.posts ?? profile?.mediaCount ?? profile?.media_count ?? 0;

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
              Instagram Direct oficial
            </div>
            <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 14, lineHeight: 1.7 }}>
              Conexão oficial Meta com perfil, Page binding, insights e operação honesta dentro do
              que a API do Instagram suporta.
            </div>
          </div>
          <StatusBadge status={instagram?.status} connected={connected} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ActionButton disabled={busy !== null} onClick={onConnect}>
            {connected ? 'Reconectar Instagram' : 'Conectar Instagram'}
          </ActionButton>
          <ActionButton secondary disabled={busy !== null} onClick={onRefresh}>
            Atualizar estado
          </ActionButton>
          <ActionButton secondary disabled={!connectionStatus?.meta?.connected || busy !== null} onClick={onDisconnect}>
            Desconectar Meta
          </ActionButton>
        </div>

        {!connected ? (
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
            Se o Page estiver conectado mas o perfil profissional do Instagram não aparecer aqui, a
            Meta ainda não entregou um `instagram_business_account` válido para este workspace.
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <InfoCard label="Username" value={profile?.username || instagram?.username || 'Pendente'} />
        <InfoCard label="Instagram Account ID" value={instagram?.instagramAccountId || 'Pendente'} />
        <InfoCard label="Page vinculada" value={instagram?.pageName || connectionStatus?.meta?.pageName || 'Pendente'} />
        <InfoCard label="Bio" value={profile?.bio || 'Sem bio disponível'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <MetricCard label="Seguidores" value={followers} />
        <MetricCard label="Posts" value={posts} />
        <MetricCard label="Impressões" value={insights?.impressions || 0} />
        <MetricCard label="Alcance" value={insights?.reach || 0} />
      </div>

      <FeedCard messages={feed} />
      <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 12, lineHeight: 1.7 }}>
        DM e automação só devem ser tratadas como verdes quando o perfil profissional do Instagram
        realmente estiver vinculado ao Page certo e os webhooks estiverem entregando eventos reais
        para este workspace.
      </div>
    </div>
  );
}
