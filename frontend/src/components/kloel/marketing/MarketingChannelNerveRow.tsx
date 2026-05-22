'use client';

import {
  CH_CONFIG,
  ChannelConnectBadge,
  NP,
  BG_CARD,
  BORDER,
  SORA,
  MONO,
  Fmt,
} from './MarketingShared';
import type { ChannelRealData } from './MarketingTypes';

export interface ChannelNerveRowProps {
  channelKey: string;
  cfg: (typeof CH_CONFIG)[string];
  data: ChannelRealData | undefined;
  isMobile: boolean;
  onOpen: (id: string) => void;
}

export function ChannelNerveRow({ channelKey, cfg, data, isMobile, onOpen }: ChannelNerveRowProps) {
  const isLive = data?.status === 'live';
  const intensity = data?.sales ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(channelKey)}
      aria-label={`Abrir canal ${cfg.label ?? channelKey}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: 14,
        padding: '14px 16px 14px 20px',
        background: BG_CARD,
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
        cursor: 'pointer',
        transition: 'all .2s',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: cfg.color,
        }}
      />
      <span style={{ color: cfg.color }}>{cfg.icon(18)}</span>
      <span
        style={{
          fontFamily: SORA,
          fontSize: 14,
          color: 'var(--app-text-primary)',
          minWidth: 90,
        }}
      >
        {cfg.label}
      </span>
      <ChannelConnectBadge isLive={isLive} hasIntegration={cfg.hasIntegration} />
      <div
        style={{
          flex: 1,
          width: isMobile ? '100%' : undefined,
          display: 'flex',
          gap: isMobile ? 8 : 16,
          justifyContent: isMobile ? 'flex-start' : 'flex-end',
          flexWrap: 'wrap',
          fontFamily: MONO,
          fontSize: 12,
        }}
      >
        <span style={{ color: 'var(--app-text-secondary)' }}>{Fmt(data?.messages ?? 0)} msgs</span>
        <span style={{ color: 'var(--app-text-secondary)' }}>{Fmt(data?.leads ?? 0)} leads</span>
        <span style={{ color: cfg.color }}>{intensity} vendas</span>
      </div>
      <NP w={160} h={28} color={cfg.color} />
    </button>
  );
}
