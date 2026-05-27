'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  CHANNEL_META,
  type ChannelKey,
  type ConnectStatus,
  type GoogleAdsStatus,
  type TikTokStatus,
  statusText,
  trustedExternalUrl,
} from './OfficialMarketingChannelPage.helpers';

interface Props {
  channel: ChannelKey;
}

export function OfficialMarketingChannelPage({ channel }: Props) {
  const meta = CHANNEL_META[channel];
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [tiktokStatus, setTikTokStatus] = useState<TikTokStatus | null>(null);
  const [tiktokReadStatus, setTikTokReadStatus] = useState<Record<string, unknown> | null>(null);
  const [googleAdsStatus, setGoogleAdsStatus] = useState<GoogleAdsStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const connection = useMemo(() => {
    if (channel === 'tiktok') {
      return {
        connected: tiktokStatus?.connected,
        status: tiktokStatus?.status,
      };
    }
    if (channel === 'google-ads') {
      return {
        connected: googleAdsStatus?.connected,
        status: googleAdsStatus?.status,
      };
    }
    return status?.channels?.[channel] || null;
  }, [channel, googleAdsStatus, status, tiktokStatus]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextStatus = await apiFetch<ConnectStatus>('/marketing/connect/status');
      if (nextStatus.error) {
        throw new Error(nextStatus.error);
      }
      setStatus(nextStatus.data || (nextStatus as ConnectStatus));
      if (channel === 'tiktok') {
        const nextTikTok = await apiFetch<TikTokStatus>('/marketing/connect/tiktok/status');
        if (nextTikTok.error) {
          throw new Error(nextTikTok.error);
        }
        setTikTokStatus(nextTikTok.data || null);
      }
      if (channel === 'google-ads') {
        const nextGoogleAds = await apiFetch<GoogleAdsStatus>(
          '/marketing/connect/google-ads/status',
        );
        if (nextGoogleAds.error) {
          throw new Error(nextGoogleAds.error);
        }
        setGoogleAdsStatus(nextGoogleAds.data || null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar status.');
    } finally {
      setIsLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openMeta = useCallback(async () => {
    setBusy('meta');
    setMessage(null);
    try {
      const returnTo = `/marketing/${channel}`;
      const response = await apiFetch<{ url?: string }>(
        `/meta/auth/url?channel=${encodeURIComponent(channel)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
      const url = String(response.data?.url || '').trim();
      if (
        !url ||
        !trustedExternalUrl(url, [
          'facebook.com',
          'www.facebook.com',
          'business.facebook.com',
          'instagram.com',
          'www.instagram.com',
          'api.instagram.com',
        ])
      ) {
        throw new Error('URL oficial da Meta indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir Meta.');
      setBusy(null);
    }
  }, [channel]);

  const toggleEmail = useCallback(
    async (enabled: boolean) => {
      setBusy('email');
      setMessage(null);
      const response = await apiFetch('/marketing/connect/email', {
        method: 'POST',
        body: { enabled },
      });
      setBusy(null);
      if (response.error) {
        setMessage(response.error);
        return;
      }
      setMessage(enabled ? 'Email ativado.' : 'Email desativado.');
      await refresh();
    },
    [refresh],
  );

  const sendEmailTest = useCallback(async () => {
    setBusy('email-test');
    setMessage(null);
    const response = await apiFetch<{ toEmail?: string; provider?: string }>(
      '/marketing/connect/email/test',
      { method: 'POST', body: {} },
    );
    setBusy(null);
    setMessage(
      response.error || `Email de teste enviado via ${response.data?.provider || 'provider'}.`,
    );
  }, []);

  const openTikTok = useCallback(async (kind: 'creator' | 'advertiser') => {
    setBusy(`tiktok-${kind}`);
    setMessage(null);
    try {
      const response = await apiFetch<{ url?: string }>(
        `/marketing/connect/tiktok/url?kind=${kind}`,
      );
      const url = String(response.data?.url || '').trim();
      const hosts =
        kind === 'advertiser' ? ['business-api.tiktok.com'] : ['www.tiktok.com', 'tiktok.com'];
      if (!url || !trustedExternalUrl(url, hosts)) {
        throw new Error('URL oficial do TikTok indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir TikTok.');
      setBusy(null);
    }
  }, []);

  const readTikTokProfile = useCallback(async () => {
    setBusy('tiktok-profile');
    setMessage(null);
    const response = await apiFetch<Record<string, unknown>>('/marketing/connect/tiktok/profile');
    setBusy(null);
    if (response.error) {
      setMessage(response.error);
      return;
    }
    setTikTokReadStatus(response.data || null);
    setMessage('Perfil TikTok lido pela API oficial.');
  }, []);

  const readTikTokCampaigns = useCallback(async () => {
    setBusy('tiktok-campaigns');
    setMessage(null);
    const response = await apiFetch<Record<string, unknown>>('/marketing/connect/tiktok/campaigns');
    setBusy(null);
    if (response.error) {
      setMessage(response.error);
      return;
    }
    setTikTokReadStatus(response.data || null);
    setMessage('Campanhas TikTok lidas pela Business API.');
  }, []);

  const openGoogleAds = useCallback(async () => {
    setBusy('google-ads');
    setMessage(null);
    try {
      const response = await apiFetch<{ url?: string }>('/marketing/connect/google-ads/url');
      const url = String(response.data?.url || '').trim();
      if (!url || !trustedExternalUrl(url, ['accounts.google.com'])) {
        throw new Error('URL oficial do Google Ads indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir Google Ads.');
      setBusy(null);
    }
  }, []);

  const syncGoogleAdsCustomers = useCallback(async () => {
    setBusy('google-ads-customers');
    setMessage(null);
    const response = await apiFetch<{ customers?: string[] }>(
      '/marketing/connect/google-ads/customers',
    );
    setBusy(null);
    if (response.error) {
      setMessage(response.error);
      return;
    }
    setMessage(`${response.data?.customers?.length || 0} conta(s) Google Ads sincronizada(s).`);
    await refresh();
  }, [refresh]);

  const details =
    channel === 'tiktok'
      ? tiktokReadStatus || tiktokStatus
      : channel === 'google-ads'
        ? googleAdsStatus
        : connection;
  const setupUnavailable =
    connection?.status === 'server_not_configured' || connection?.status === 'unavailable';
  const badgeStatus = isLoading
    ? 'Carregando'
    : statusText(connection?.connected, connection?.status);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '28px clamp(16px, 4vw, 40px)',
        background: KLOEL_THEME.bgPrimary,
        color: KLOEL_THEME.textPrimary,
        fontFamily: "'Sora', system-ui, sans-serif",
      }}
    >
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {(['whatsapp', 'instagram', 'facebook', 'tiktok', 'google-ads', 'email'] as ChannelKey[])
          .map((item) => (
            <Link
              key={item}
              href={`/marketing/${item}`}
              style={{
                color: item === channel ? CHANNEL_META[item].color : KLOEL_THEME.textSecondary,
                textDecoration: 'none',
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
              }}
            >
              {CHANNEL_META[item].label}
            </Link>
          ))}
      </nav>

      <section style={{ maxWidth: 920, margin: '0 auto' }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.05 }}>
              {meta.label}
            </h1>
            <p style={{ color: KLOEL_THEME.textSecondary, lineHeight: 1.7, maxWidth: 620 }}>
              {meta.summary}
            </p>
          </div>
          <span
            style={{
              height: 28,
              borderRadius: 6,
              padding: '5px 10px',
              color: connection?.connected ? KLOEL_THEME.success : KLOEL_THEME.error,
              background: connection?.connected ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {badgeStatus}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            margin: '22px 0',
          }}
        >
          {meta.proof.map((item) => (
            <div
              key={item}
              style={{
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                background: KLOEL_THEME.bgCard,
                borderRadius: 6,
                padding: 14,
                borderLeft: `3px solid ${meta.color}`,
              }}
            >
              {item}
            </div>
          ))}
        </div>

        <ol
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            margin: '0 0 22px',
            padding: 0,
            listStyle: 'none',
          }}
        >
          {meta.steps.map((step, index) => (
            <li
              key={step}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr',
                gap: 10,
                alignItems: 'center',
                minHeight: 72,
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                borderRadius: 6,
                background: KLOEL_THEME.bgSecondary,
                padding: 14,
              }}
            >
              <span
                aria-label={`Passo ${index + 1}`}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: meta.color,
                  color: KLOEL_THEME.textOnAccent,
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {index + 1}
              </span>
              <span style={{ color: KLOEL_THEME.textPrimary, lineHeight: 1.45 }}>{step}</span>
            </li>
          ))}
        </ol>

        {isLoading ? (
          <p style={{ color: KLOEL_THEME.textSecondary }}>Carregando status oficial...</p>
        ) : loadError ? (
          <p style={{ color: KLOEL_THEME.error }}>Falha ao carregar conexão: {loadError}</p>
        ) : setupUnavailable ? (
          <p style={{ color: KLOEL_THEME.textSecondary }}>
            Configuração server-side pendente para este canal.
          </p>
        ) : !connection?.connected ? (
          <p style={{ color: KLOEL_THEME.textSecondary }}>
            Nenhuma conta conectada neste workspace.
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {channel === 'email' ? (
            <>
              <button
                type="button"
                onClick={() => void toggleEmail(true)}
                style={buttonStyle(meta.color)}
              >
                {busy === 'email' ? 'Ativando...' : 'Conectar Email'}
              </button>
              <button
                type="button"
                onClick={() => void sendEmailTest()}
                style={secondaryButtonStyle}
              >
                {busy === 'email-test' ? 'Enviando...' : 'Enviar teste'}
              </button>
            </>
          ) : channel === 'tiktok' ? (
            <>
              <button
                type="button"
                onClick={() => void openTikTok('creator')}
                style={buttonStyle(meta.color)}
              >
                {busy === 'tiktok-creator' ? 'Abrindo...' : 'Conectar conta TikTok'}
              </button>
              <button
                type="button"
                onClick={() => void openTikTok('advertiser')}
                style={secondaryButtonStyle}
              >
                {busy === 'tiktok-advertiser' ? 'Abrindo...' : 'Conectar advertiser'}
              </button>
              <button
                type="button"
                onClick={() => void readTikTokProfile()}
                style={secondaryButtonStyle}
              >
                {busy === 'tiktok-profile' ? 'Lendo...' : 'Ler perfil'}
              </button>
              <button
                type="button"
                onClick={() => void readTikTokCampaigns()}
                style={secondaryButtonStyle}
              >
                {busy === 'tiktok-campaigns' ? 'Lendo...' : 'Ler campanhas'}
              </button>
            </>
          ) : channel === 'google-ads' ? (
            <>
              <button type="button" onClick={() => void openGoogleAds()} style={buttonStyle(meta.color)}>
                {busy === 'google-ads' ? 'Abrindo...' : 'Conectar Google Ads'}
              </button>
              <button
                type="button"
                onClick={() => void syncGoogleAdsCustomers()}
                style={secondaryButtonStyle}
              >
                {busy === 'google-ads-customers' ? 'Sincronizando...' : 'Sincronizar contas'}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void openMeta()} style={buttonStyle(meta.color)}>
              {busy === 'meta' ? 'Abrindo...' : `Conectar ${meta.label} via Meta oficial`}
            </button>
          )}
          <button type="button" onClick={() => void refresh()} style={secondaryButtonStyle}>
            Recarregar status
          </button>
        </div>

        {message ? <p style={{ color: KLOEL_THEME.textSecondary }}>{message}</p> : null}

        <pre
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 6,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgCard,
            color: KLOEL_THEME.textSecondary,
            overflowX: 'auto',
            fontSize: 12,
          }}
        >
          {JSON.stringify(details || {}, null, 2)}
        </pre>
      </section>
    </main>
  );
}

function buttonStyle(color: string): React.CSSProperties {
  return {
    border: 'none',
    borderRadius: 6,
    background: color,
    color: KLOEL_THEME.textOnAccent,
    padding: '12px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  borderRadius: 6,
  background: KLOEL_THEME.bgCard,
  color: KLOEL_THEME.textPrimary,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
};
