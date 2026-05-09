'use client';

import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { mutate as globalMutate } from 'swr';
import { SORA, EMBER } from './ContaConstants';
import { SectionCard } from './ContaShared';
import { MetaAuthStatus, MetaAuthUrlResponse } from './ContaTypes';

export function MetaConnectSection() {
  const [status, setStatus] = useState<MetaAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    apiFetch<MetaAuthStatus>('/meta/auth/status')
      .then((res) => {
        setStatus(res.data ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    try {
      const res = await apiFetch<MetaAuthUrlResponse>('/meta/auth/url');
      const url = res.data?.url || res.data?.data?.url;
      if (url) {
        window.open(url, 'meta-auth', 'width=600,height=700');
      }
    } catch {
      // silent
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await apiFetch('/meta/auth/disconnect', { method: 'POST' });
      setStatus({ connected: false });
      globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/meta'));
    } catch {
      // silent
    }
    setDisconnecting(false);
  };

  if (loading) {
    return (
      <SectionCard
        title={kloelT(`Meta Platform`)}
        subtitle={kloelT(`Instagram, Messenger, Meta Ads`)}
      >
        <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {kloelT(`Carregando...`)}
        </div>
      </SectionCard>
    );
  }

  if (status?.connected) {
    return (
      <SectionCard
        title={kloelT(`Meta Platform`)}
        subtitle={kloelT(`Instagram, Messenger, Meta Ads`)}
      >
        <div
          style={{
            background: 'rgba(16,185,129,.04)',
            border: '1px solid rgba(16,185,129,.15)',
            borderRadius: 6,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.semantic.success }} />
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: colors.semantic.success,
                fontFamily: SORA,
                display: 'block',
              }}
            >
              {kloelT(`Conectado ao Meta`)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
              {status.pageName ? `Pagina: ${status.pageName}` : ''}
              {status.instagramUsername ? ` | @${status.instagramUsername}` : ''}
              {status.adAccountId ? ` | Ads: ${status.adAccountId}` : ''}
            </span>
          </div>
        </div>
        {status.tokenExpired && (
          <div
            style={{
              background: 'rgba(245,158,11,.04)',
              border: '1px solid rgba(245,158,11,.15)',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, color: colors.semantic.warning, fontFamily: SORA }}>
              {kloelT(`Token expirado. Reconecte para renovar.`)}
            </span>
            <button
              type="button"
              onClick={handleConnect}
              style={{
                padding: '6px 14px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: colors.text.silver,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Reconectar`)}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              padding: '9px 20px',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 6,
              color: colors.semantic.error,
              fontSize: 12,
              fontWeight: 600,
              cursor: disconnecting ? 'not-allowed' : 'pointer',
              fontFamily: SORA,
              transition: 'all 150ms ease',
              opacity: disconnecting ? 0.5 : 1,
            }}
          >
            {disconnecting ? 'Desconectando...' : 'Desconectar Meta'}
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={kloelT(`Meta Platform`)}
      subtitle={kloelT(`Conecte Instagram, Messenger e Meta Ads`)}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          gap: 16,
          padding: '16px 0',
        }}
      >
        <div style={{ color: colors.semantic.info, opacity: 0.3 }}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d={kloelT(
                `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
              )}
            />
          </svg>
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            textAlign: 'center',
            maxWidth: 400,
            lineHeight: 1.6,
          }}
        >
          {kloelT(`Conecte sua conta Meta para gerenciar Instagram DM, Messenger e Meta Ads diretamente na
          KLOEL.`)}
        </div>
        <button
          type="button"
          onClick={handleConnect}
          style={{
            padding: '11px 28px',
            background: colors.semantic.info,
            border: 'none',
            borderRadius: 6,
            color: colors.text.silver,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: SORA,
            transition: 'all 150ms ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d={kloelT(
                `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
              )}
            />
          </svg>

          {kloelT(`Conectar com Meta`)}
        </button>
      </div>
    </SectionCard>
  );
}
