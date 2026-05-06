'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { KLOEL_THEME } from '@/lib/kloel-theme';

type ChannelKey = 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'tiktok';

interface Props {
  channel: ChannelKey;
}

interface ConnectStatus {
  channels?: {
    whatsapp?: ChannelConnection;
    instagram?: ChannelConnection;
    facebook?: ChannelConnection;
    email?: ChannelConnection & {
      provider?: string;
      providerAvailable?: boolean;
      fromEmail?: string;
      fromName?: string;
    };
  };
}

interface ChannelConnection {
  connected?: boolean;
  status?: string;
  authUrl?: string;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  phoneNumber?: string | null;
  pageName?: string | null;
  pageId?: string | null;
  username?: string | null;
  instagramAccountId?: string | null;
}

interface TikTokStatus {
  connected?: boolean;
  status?: string;
  kind?: string | null;
  openId?: string | null;
  advertiserIds?: string[];
  expiresAt?: string | null;
  secretConfigured?: boolean;
}

const CHANNEL_META: Record<
  ChannelKey,
  { label: string; color: string; summary: string; proof: string[]; steps: string[] }
> = {
  whatsapp: {
    label: 'WhatsApp',
    color: 'rgb(37 211 102)',
    summary: 'Conecte o WABA e o número do cliente pelo Embedded Signup oficial da Meta.',
    proof: ['WABA do workspace', 'Número próprio', 'Envio e webhooks via Cloud API'],
    steps: [
      'Abrir Embedded Signup oficial da Meta',
      'Selecionar ou criar WABA e número do cliente',
      'Voltar para o KLOEL com Cloud API ativa',
    ],
  },
  instagram: {
    label: 'Instagram Direct',
    color: 'rgb(225 48 108)',
    summary: 'Conecte a conta Meta com Instagram Business para operar Direct e comentários.',
    proof: ['Instagram Business', 'Permissões de mensagens', 'Perfil e insights reais'],
    steps: [
      'Abrir login oficial da Meta',
      'Selecionar a Page com Instagram Business vinculado',
      'Voltar para o KLOEL com Direct e comentários autorizados',
    ],
  },
  facebook: {
    label: 'Messenger Facebook',
    color: 'rgb(24 119 242)',
    summary: 'Conecte a Page Meta para automatizar conversas do Messenger.',
    proof: ['Page vinculada', 'Page access token', 'Messenger API'],
    steps: [
      'Abrir login oficial da Meta',
      'Selecionar a Page do cliente',
      'Voltar para o KLOEL com Messenger autorizado',
    ],
  },
  email: {
    label: 'Email',
    color: 'rgb(245 158 11)',
    summary: 'Ative o provider configurado no backend para enviar testes e campanhas.',
    proof: ['Provider server-side', 'Remetente configurado', 'Envio de teste'],
    steps: [
      'Validar provider configurado no backend',
      'Ativar o canal de email do workspace',
      'Enviar teste real para confirmar entrega',
    ],
  },
  tiktok: {
    label: 'TikTok',
    color: 'rgb(254 44 85)',
    summary: 'Conecte creator e advertiser pelos fluxos oficiais do TikTok.',
    proof: ['Creator OAuth', 'Advertiser OAuth', 'Tokens salvos no workspace'],
    steps: [
      'Conectar a conta TikTok do usuário',
      'Conectar o advertiser autorizado no Business API',
      'Voltar para o KLOEL com tokens do workspace salvos',
    ],
  },
};

function trustedExternalUrl(value: string, allowedHosts: string[]) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

function statusText(connected?: boolean, status?: string) {
  if (connected) {
    return 'Conectado';
  }
  return status === 'server_not_configured' ? 'Configuração pendente' : 'Desconectado';
}

export function OfficialMarketingChannelPage({ channel }: Props) {
  const meta = CHANNEL_META[channel];
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [tiktokStatus, setTikTokStatus] = useState<TikTokStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const connection = useMemo(() => {
    if (channel === 'tiktok') {
      return {
        connected: tiktokStatus?.connected,
        status: tiktokStatus?.status,
      };
    }
    return status?.channels?.[channel] || null;
  }, [channel, status, tiktokStatus]);

  const refresh = useCallback(async () => {
    const nextStatus = await apiFetch<ConnectStatus>('/marketing/connect/status');
    if (!nextStatus.error) {
      setStatus(nextStatus.data || (nextStatus as ConnectStatus));
    }
    if (channel === 'tiktok') {
      const nextTikTok = await apiFetch<TikTokStatus>('/marketing/connect/tiktok/status');
      if (!nextTikTok.error) {
        setTikTokStatus(nextTikTok.data || null);
      }
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
      if (!url || !trustedExternalUrl(url, ['facebook.com', 'www.facebook.com'])) {
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

  const details = channel === 'tiktok' ? tiktokStatus : connection;

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
        {(['whatsapp', 'instagram', 'facebook', 'tiktok', 'email'] as ChannelKey[]).map((item) => (
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
            {statusText(connection?.connected, connection?.status)}
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
