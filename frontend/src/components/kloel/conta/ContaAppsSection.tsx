'use client';
import useSWR from 'swr';

import { colors } from '@/lib/design-tokens';
import { swrFetcher } from '@/lib/fetcher';
import { kloelT } from '@/lib/i18n/t';
import { SORA } from './ContaConstants';
import { MetaConnectSection } from './ContaMetaConnectSection';
import type { SettingsSectionKey } from './ContaTypes';

interface ContaAppsSectionProps {
  handleSelectSection: (section: SettingsSectionKey) => void;
  router: {
    push: (url: string) => void;
  };
}

type AppTone = 'connected' | 'disconnected' | 'neutral' | 'error';

interface AppCardData {
  name: string;
  status: string;
  tone: AppTone;
  cta: string;
  action: () => void;
}

interface ConnectionStatus {
  connected?: boolean;
  status?: string;
  providerAvailable?: boolean;
  degradedReason?: string | null;
}

interface MarketingConnectStatus {
  meta?: ConnectionStatus & {
    pageName?: string | null;
    instagramUsername?: string | null;
  };
  channels?: {
    whatsapp?: ConnectionStatus;
    instagram?: ConnectionStatus;
    facebook?: ConnectionStatus;
    tiktok?: ConnectionStatus;
    email?: ConnectionStatus;
  };
}

interface GoogleAdsStatus {
  connected?: boolean;
  status?: string;
  loginCustomerId?: string | null;
  clientConfigured?: boolean;
  secretConfigured?: boolean;
  developerTokenConfigured?: boolean;
}

function toneColor(tone: AppTone): string {
  if (tone === 'connected') {
    return colors.semantic.success;
  }

  if (tone === 'error') {
    return colors.semantic.error;
  }

  return 'var(--app-text-placeholder)';
}

function statusText({
  loading,
  error,
  connected,
  status,
  configured,
}: {
  loading: boolean;
  error: unknown;
  connected?: boolean | undefined;
  status?: string | null | undefined;
  configured?: boolean | undefined;
}): string {
  if (loading) {
    return 'Carregando...';
  }

  if (error) {
    return 'Status indisponivel';
  }

  if (configured === false && connected !== true) {
    return 'Credenciais ausentes';
  }

  if (connected === true) {
    return 'Conectado';
  }

  return status ? status.replaceAll('_', ' ') : 'Desconectado';
}

function connectionTone({
  loading,
  error,
  connected,
}: {
  loading: boolean;
  error: unknown;
  connected?: boolean | undefined;
}): AppTone {
  if (error) {
    return 'error';
  }

  if (loading) {
    return 'neutral';
  }

  return connected === true ? 'connected' : 'disconnected';
}

function AppConnectionCard({ app }: { app: AppCardData }) {
  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '16%',
            background: toneColor(app.tone),
          }}
        />
        <div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--app-text-primary)',
              fontFamily: SORA,
              display: 'block',
            }}
          >
            {app.name}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
            }}
          >
            {app.status}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={app.action}
        style={{
          padding: '8px 14px',
          background: 'transparent',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          color: app.tone === 'connected'
            ? 'var(--app-text-primary)'
            : 'var(--app-text-secondary)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: SORA,
          whiteSpace: 'nowrap',
        }}
      >
        {app.cta}
      </button>
    </div>
  );
}

export function ContaAppsSection({ handleSelectSection, router }: ContaAppsSectionProps) {
  const {
    data: connectStatus,
    isLoading: connectLoading,
    error: connectError,
  } = useSWR<MarketingConnectStatus>('/marketing/connect/status', swrFetcher);
  const {
    data: googleStatus,
    isLoading: googleLoading,
    error: googleError,
  } = useSWR<GoogleAdsStatus>('/marketing/connect/google-ads/status', swrFetcher);

  const whatsapp = connectStatus?.channels?.whatsapp;
  const email = connectStatus?.channels?.email;
  const tiktok = connectStatus?.channels?.tiktok;
  const meta = connectStatus?.meta;
  const googleConfigured = googleStatus
    ? googleStatus.clientConfigured !== false &&
      googleStatus.secretConfigured !== false &&
      googleStatus.developerTokenConfigured !== false
    : undefined;

  const appCards: AppCardData[] = [
    {
      name: 'WhatsApp e Inbox',
      status: statusText({
        loading: connectLoading,
        error: connectError,
        connected: whatsapp?.connected,
        status: whatsapp?.degradedReason || whatsapp?.status,
        configured: whatsapp?.providerAvailable,
      }),
      tone: connectionTone({ loading: connectLoading, error: connectError, connected: whatsapp?.connected }),
      cta: 'Abrir inbox',
      action: () => router.push('/inbox'),
    },
    {
      name: 'Meta Platform',
      status: statusText({
        loading: connectLoading,
        error: connectError,
        connected: meta?.connected,
        status: meta?.status,
      }),
      tone: connectionTone({ loading: connectLoading, error: connectError, connected: meta?.connected }),
      cta: meta?.connected ? 'Abrir anuncios' : 'Conectar Meta',
      action: () => router.push('/anuncios'),
    },
    {
      name: 'Google Ads',
      status: statusText({
        loading: googleLoading,
        error: googleError,
        connected: googleStatus?.connected,
        status: googleStatus?.loginCustomerId || googleStatus?.status,
        configured: googleConfigured,
      }),
      tone: connectionTone({
        loading: googleLoading,
        error: googleError,
        connected: googleStatus?.connected,
      }),
      cta: googleStatus?.connected ? 'Abrir Google Ads' : 'Conectar Google Ads',
      action: () => router.push('/marketing/google-ads'),
    },
    {
      name: 'TikTok for Business',
      status: statusText({
        loading: connectLoading,
        error: connectError,
        connected: tiktok?.connected,
        status: tiktok?.status,
      }),
      tone: connectionTone({ loading: connectLoading, error: connectError, connected: tiktok?.connected }),
      cta: tiktok?.connected ? 'Abrir TikTok' : 'Conectar TikTok',
      action: () => router.push('/marketing/tiktok'),
    },
    {
      name: 'Email',
      status: statusText({
        loading: connectLoading,
        error: connectError,
        connected: email?.connected,
        status: email?.status,
        configured: email?.providerAvailable,
      }),
      tone: connectionTone({ loading: connectLoading, error: connectError, connected: email?.connected }),
      cta: email?.connected ? 'Abrir email' : 'Conectar email',
      action: () => router.push('/marketing/email'),
    },
    {
      name: 'Plano e cobranca Kloel',
      status: 'Modulo interno',
      tone: 'neutral',
      cta: 'Abrir billing',
      action: () => handleSelectSection('billing'),
    },
    {
      name: 'CRM e analytics',
      status: 'Modulo interno',
      tone: 'neutral',
      cta: 'Abrir configuracoes',
      action: () => handleSelectSection('crm'),
    },
  ];

  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--app-text-primary)',
          margin: '0 0 16px',
          fontFamily: SORA,
        }}
      >
        {kloelT(`Apps e integracoes`)}
      </h2>
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        {appCards.map((app) => (
          <AppConnectionCard key={app.name} app={app} />
        ))}
      </div>
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
          }}
        >
          {kloelT(`Integrações publicadas do Kloel`)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            lineHeight: 1.6,
            marginTop: 6,
          }}
        >
          {kloelT(`Os cartões acima consultam os endpoints reais de integração e mostram estado
          honesto quando uma credencial, provider ou conexão ainda não está disponível.`)}
        </div>
      </div>
      <MetaConnectSection />
    </div>
  );
}
