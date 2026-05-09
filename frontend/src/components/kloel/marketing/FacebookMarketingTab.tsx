'use client';

import React from 'react';
import { kloelT } from '@/lib/i18n/t';
import { useFacebookMarketing } from './useFacebookMarketing';
import {
  CH_CONFIG,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  ConnBadge,
  ChannelStatsList,
  ChannelInfoGridCard,
  channelDataStats,
  RegisteredDataList,
} from './MarketingShared';
import type { ChannelRealData, MarketingConnectStatus } from './MarketingTypes';

interface FacebookMarketingTabProps {
  channelData: ChannelRealData | null;
  connectionStatus?: MarketingConnectStatus | null;
  metaConnected?: boolean;
  onConnectMeta?: (channelKey: 'facebook') => void;
  connectingKey?: string | null;
}

export default function FacebookMarketingTab({
  channelData,
  connectionStatus,
  metaConnected,
  onConnectMeta,
  connectingKey,
}: FacebookMarketingTabProps) {
  const ch = CH_CONFIG.facebook;
  const { isConnected } = useFacebookMarketing(connectionStatus);

  if (!metaConnected) {
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
          onClick={() => onConnectMeta?.('facebook')}
          disabled={connectingKey === 'facebook'}
          style={{
            fontFamily: SORA,
            fontSize: 14,
            padding: '12px 32px',
            borderRadius: 6,
            border: 'none',
            background: ch.color,
            color: '#fff',
            cursor: connectingKey === 'facebook' ? 'wait' : 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: connectingKey === 'facebook' ? 0.7 : 1,
          }}
        >
          {connectingKey === 'facebook' ? 'Abrindo Meta...' : `Conectar ${ch.label}`}
        </button>

        {channelData && (channelData.messages > 0 || channelData.leads > 0) && (
          <RegisteredDataList channelData={channelData} color={ch.color} />
        )}
      </div>
    );
  }

  const connecting = connectingKey === 'facebook';
  const connection = connectionStatus?.channels?.facebook;

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
            {kloelT(`Messenger`)}
          </span>
          <ConnBadge connected={true} />
        </div>
        <button
          type="button"
          onClick={() => onConnectMeta?.('facebook')}
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
          {connecting ? 'Abrindo Meta...' : 'Reconectar Facebook'}
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
          { label: 'Pagina vinculada', value: connection?.pageName || 'Nao resolvida' },
          { label: 'Page ID', value: connection?.pageId || 'Pendente' },
          { label: 'Canal', value: 'Messenger do Facebook' },
        ].map((item) => (
          <ChannelInfoGridCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        <ChannelStatsList stats={channelDataStats(channelData)} color={ch.color} />
      </div>
    </div>
  );
}
