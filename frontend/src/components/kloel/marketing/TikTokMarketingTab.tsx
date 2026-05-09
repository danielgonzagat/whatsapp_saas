'use client';

import { useCallback, useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { useTikTokMarketing } from './useTikTokMarketing';
import { CH_CONFIG, SORA, MONO, BG_CARD, BORDER, Fmt, RegisteredDataList } from './MarketingShared';
import type { ChannelRealData } from './MarketingTypes';

interface TikTokMarketingTabProps {
  channelData: ChannelRealData | null;
}

export default function TikTokMarketingTab({ channelData }: TikTokMarketingTabProps) {
  const ch = CH_CONFIG.tiktok;
  const { tiktokStatus, isConnected, isLoading, refreshStatus, openTikTokConnect } =
    useTikTokMarketing();
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleConnect = useCallback(
    async (kind: 'creator' | 'advertiser') => {
      setBusyKind(kind);
      setMessage(null);
      try {
        await openTikTokConnect(kind);
      } catch (error: unknown) {
        setBusyKind(null);
        setMessage(error instanceof Error ? error.message : 'Falha ao abrir TikTok.');
      }
    },
    [openTikTokConnect],
  );

  if (isConnected && tiktokStatus) {
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
            <ConnectedBadge />
          </div>
          <button
            type="button"
            onClick={() => refreshStatus()}
            style={{
              fontFamily: SORA,
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${ch.color}40`,
              background: `${ch.color}10`,
              color: ch.color,
              cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {[
            { label: 'Status', value: tiktokStatus.status || 'Ativo' },
            { label: 'Tipo', value: tiktokStatus.kind || 'creator' },
            { label: 'Open ID', value: tiktokStatus.openId || 'N/A' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: BG_CARD,
                borderRadius: 6,
                padding: '12px 14px',
                border: `1px solid ${BORDER}`,
              }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                  marginBottom: 6,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: 'var(--app-text-primary)',
                  wordBreak: 'break-word',
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {channelData && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {[
              { label: 'Mensagens', value: Fmt(channelData.messages) },
              { label: 'Leads', value: Fmt(channelData.leads) },
              { label: 'Vendas', value: channelData.sales.toString() },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 16px 12px 20px',
                  background: BG_CARD,
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
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
                    background: ch.color,
                  }}
                />
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 11,
                    color: 'var(--app-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.25em',
                    minWidth: 120,
                  }}
                >
                  {s.label}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 16,
                    color: 'var(--app-text-primary)',
                    flex: 1,
                  }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
        {isLoading
          ? 'Verificando status do TikTok...'
          : kloelT(
              `Conecte sua conta TikTok para operar campanhas e mensagens diretas dentro do Marketing da KLOEL.`,
            )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => handleConnect('creator')}
          disabled={busyKind !== null || isLoading}
          style={{
            fontFamily: SORA,
            fontSize: 14,
            padding: '12px 32px',
            borderRadius: 6,
            border: 'none',
            background: ch.color,
            color: '#fff',
            cursor: busyKind !== null ? 'wait' : 'pointer',
            fontWeight: 600,
            opacity: busyKind !== null ? 0.7 : 1,
          }}
        >
          {busyKind === 'creator' ? 'Abrindo...' : 'Conectar conta TikTok'}
        </button>
        <button
          type="button"
          onClick={() => handleConnect('advertiser')}
          disabled={busyKind !== null || isLoading}
          style={{
            fontFamily: SORA,
            fontSize: 14,
            padding: '12px 32px',
            borderRadius: 6,
            border: `1px solid ${ch.color}40`,
            background: `${ch.color}10`,
            color: ch.color,
            cursor: busyKind !== null ? 'wait' : 'pointer',
            fontWeight: 600,
            opacity: busyKind !== null ? 0.7 : 1,
          }}
        >
          {busyKind === 'advertiser' ? 'Abrindo...' : 'Conectar advertiser'}
        </button>
      </div>

      {message && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            padding: '10px 16px',
            borderRadius: 6,
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            maxWidth: 420,
          }}
        >
          {message}
        </div>
      )}

      {channelData && (channelData.messages > 0 || channelData.leads > 0) && (
        <RegisteredDataList channelData={channelData} color={ch.color} />
      )}
    </div>
  );
}

function ConnectedBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontFamily: MONO,
        color: '#10B981',
        background: 'rgba(16,185,129,0.1)',
        padding: '2px 8px',
        borderRadius: 99,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#10B981',
          animation: 'mktPulse 2s infinite',
        }}
      />
      Conectado
    </span>
  );
}

