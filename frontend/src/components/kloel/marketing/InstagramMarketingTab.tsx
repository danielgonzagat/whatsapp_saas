'use client';

import { kloelT } from '@/lib/i18n/t';
import { useInstagramMarketing } from './useInstagramMarketing';
import {
  CH_CONFIG,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  Fmt,
  ConnBadge,
  ChannelStatsList,
  ChannelInfoGridCard,
  channelDataStats,
  RegisteredDataList,
} from './MarketingShared';
import type { ChannelRealData, MarketingConnectStatus } from './MarketingTypes';

interface InstagramMarketingTabProps {
  channelData: ChannelRealData | null;
  connectionStatus?: MarketingConnectStatus | null;
  metaConnected?: boolean;
  onConnectMeta?: (channelKey: 'instagram') => void;
  connectingKey?: string | null;
}

export default function InstagramMarketingTab({
  channelData,
  connectionStatus,
  metaConnected,
  onConnectMeta,
  connectingKey,
}: InstagramMarketingTabProps) {
  const ch = CH_CONFIG.instagram;
  const { igProfile, igInsights } = useInstagramMarketing(connectionStatus);

  if (!metaConnected) {
    return (
      <MetaConnectPrompt
        channelKey="instagram"
        channelData={channelData}
        onConnect={() => onConnectMeta?.('instagram')}
        connecting={connectingKey === 'instagram'}
      />
    );
  }

  const connecting = connectingKey === 'instagram';
  const connection = connectionStatus?.channels?.instagram;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: ch.color }}>{ch.icon(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: 'var(--app-text-primary)' }}>
            {ch.label}
          </span>
          <ConnBadge connected={true} />
        </div>
        <button
          type="button"
          onClick={() => onConnectMeta?.('instagram')}
          disabled={connecting}
          style={{
            fontFamily: SORA,
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${ch.color}40`,
            background: `${ch.color}10`,
            color: ch.color,
            cursor: connecting ? 'wait' : 'pointer',
            opacity: connecting ? 0.7 : 1,
          }}
        >
          {connecting ? 'Abrindo Meta...' : 'Reconectar Instagram'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: 'Conta vinculada',
            value: connection?.username ? `@${connection.username}` : 'Nao resolvida',
          },
          { label: 'Conta Meta', value: connection?.pageName || 'Nao resolvida' },
          { label: 'Instagram ID', value: connection?.instagramAccountId || 'Pendente' },
        ].map((item) => (
          <ChannelInfoGridCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      {igProfile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: 16,
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: `${ch.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: ch.color,
            }}
          >
            {ch.icon(24)}
          </div>
          <div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
              @{igProfile.username || igProfile.name || 'instagram'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--app-text-secondary)' }}>
              {igProfile.followers_count ?? igProfile.followersCount ?? 0}{' '}
              {kloelT(`seguidores &#183;`)} {igProfile.media_count ?? igProfile.mediaCount ?? 0}{' '}
              publicacoes
            </div>
          </div>
        </div>
      )}

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}
      >
        {[
          {
            label: 'Impressoes',
            value: Fmt(igInsights?.impressions ?? channelData?.messages ?? 0),
          },
          { label: 'Alcance', value: Fmt(igInsights?.reach ?? 0) },
          {
            label: 'Seguidores',
            value: Fmt(
              igInsights?.follower_count ??
                igProfile?.followers_count ??
                igProfile?.followersCount ??
                0,
            ),
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: BG_CARD,
              borderRadius: 6,
              padding: 14,
              border: `1px solid ${BORDER}`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 10,
                color: 'var(--app-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                marginBottom: 4,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 20, color: 'var(--app-text-primary)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        <ChannelStatsList stats={channelDataStats(channelData)} color={ch.color} />
      </div>
    </div>
  );
}

function MetaConnectPrompt({
  channelKey,
  channelData,
  onConnect,
  connecting,
}: {
  channelKey: string;
  channelData: ChannelRealData | null;
  onConnect: () => void;
  connecting?: boolean;
}) {
  const ch = CH_CONFIG[channelKey];
  if (!ch) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 20,
      }}
    >
      <div style={{ color: ch.color, opacity: 0.25 }}>{ch.icon(80)}</div>
      <div style={{ fontFamily: SORA, fontSize: 22, color: 'var(--app-text-primary)' }}>
        {kloelT(`Conectar`)} {ch.label}
      </div>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 14,
          color: 'var(--app-text-secondary)',
          maxWidth: 420,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {kloelT(`Conecte sua conta Meta para liberar`)} {ch.label}{' '}
        {kloelT(`dentro do Marketing da KLOEL. O fluxo abre a
        autorizacao oficial da Meta e retorna para este canal.`)}
      </div>
      <button
        type="button"
        onClick={() => onConnect()}
        disabled={connecting}
        style={{
          fontFamily: SORA,
          fontSize: 14,
          padding: '12px 32px',
          borderRadius: 6,
          border: 'none',
          background: ch.color,
          color: '#fff',
          cursor: connecting ? 'wait' : 'pointer',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: connecting ? 0.7 : 1,
        }}
      >
        {connecting ? 'Abrindo Meta...' : `Conectar ${ch.label}`}
      </button>

      {channelData && (channelData.messages > 0 || channelData.leads > 0) && (
        <RegisteredDataList channelData={channelData} color={ch.color} />
      )}
    </div>
  );
}

