'use client';

import { kloelError } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import {
  useAIBrain,
  useMarketingChannels,
  useMarketingLiveFeed,
  useMarketingStats,
} from '@/hooks/useMarketing';
import { useProducts } from '@/hooks/useProducts';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

import {
  IC,
  CH_CONFIG,
  SORA,
  EMBER,
  navigateCurrentWindow,
  isTrustedMetaOauthUrl,
  formatFeedMessage,
} from './MarketingShared';
import type {
  ChannelRealData,
  MarketingConnectStatus,
  FeedMessageLike,
  IgProfileData,
  IgInsightsData,
} from './MarketingTypes';

import { mapTopProducts, toChannelDataMap } from './marketing-utils';
import { MarketingConversationsHub } from './MarketingConversationsHub';

import WhatsAppMarketingTab from './WhatsAppMarketingTab';
import InstagramMarketingTab from './InstagramMarketingTab';
import TikTokMarketingTab from './TikTokMarketingTab';
import FacebookMarketingTab from './FacebookMarketingTab';
import EmailMarketingTab from './EmailMarketingTab';
import SmsMarketingTab from './SmsMarketingTab';

export default function MarketingView({ defaultTab = 'conversas' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace, userEmail, userName } = useAuth();
  const [tab, setTab] = useState(defaultTab);
  const prevDefault = useRef(defaultTab);
  useEffect(() => {
    if (prevDefault.current !== defaultTab) {
      setTab(defaultTab);
      prevDefault.current = defaultTab;
    }
  }, [defaultTab]);
  const [feed, setFeed] = useState<string[]>([]);
  const requestedMode = searchParams?.get('mode') || searchParams?.get('focus') || undefined;
  const metaQueryState = searchParams?.get('meta') || null;
  const metaQueryReason = searchParams?.get('reason') || null;
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  const { data: connectionStatus, mutate: mutateConnectionStatus } = useSWR<MarketingConnectStatus>(
    '/marketing/connect/status',
    swrFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const { data: metaStatus } = useSWR<{ connected?: boolean }>('/meta/auth/status', swrFetcher);
  const metaConnected =
    connectionStatus?.meta?.connected === true || metaStatus?.connected === true;

  const { data: igProfile } = useSWR<IgProfileData>(
    connectionStatus?.channels?.instagram?.connected ? '/meta/instagram/profile' : null,
    swrFetcher,
  );
  const { data: igInsights } = useSWR<IgInsightsData>(
    connectionStatus?.channels?.instagram?.connected ? '/meta/instagram/insights/account' : null,
    swrFetcher,
  );

  useEffect(() => {
    CH_CONFIG.whatsapp.hasIntegration = connectionStatus?.channels?.whatsapp?.connected === true;
    CH_CONFIG.instagram.hasIntegration = connectionStatus?.channels?.instagram?.connected === true;
    CH_CONFIG.facebook.hasIntegration = connectionStatus?.channels?.facebook?.connected === true;
    CH_CONFIG.email.hasIntegration = connectionStatus?.channels?.email?.connected === true;
    CH_CONFIG.sms.hasIntegration = false;
  }, [connectionStatus]);

  const handleConnectMeta = useCallback(
    async (channelKey: 'whatsapp' | 'instagram' | 'facebook') => {
      setConnectingKey(channelKey);
      try {
        const returnTo = `/marketing/${channelKey}`;
        const res = await apiFetch<{ url?: string }>(
          `/meta/auth/url?channel=${encodeURIComponent(channelKey)}&returnTo=${encodeURIComponent(returnTo)}`,
        );
        const url = String(res?.data?.url || '').trim();
        if (!url) {
          throw kloelError('Nao foi possivel iniciar a conexao oficial da Meta.');
        }
        if (!isTrustedMetaOauthUrl(url)) {
          throw kloelError('Redirecionamento bloqueado: destino Meta invalido.');
        }
        navigateCurrentWindow(url);
      } catch (error: unknown) {
        setConnectingKey(null);
        setConnectionMessage(error instanceof Error ? error.message : 'Falha ao abrir a Meta.');
      }
    },
    [],
  );

  const handleConnectEmail = useCallback(async () => {
    setConnectingKey('email');
    try {
      await apiFetch('/marketing/connect/email', { method: 'POST', body: { enabled: true } });
      await mutateConnectionStatus();
      setEmailTestResult(
        'Email ativado com sucesso. Agora voce pode enviar campanhas e testar a entrega.',
      );
    } catch (error: unknown) {
      setEmailTestResult(
        error instanceof Error ? error.message : 'Falha ao ativar o canal de email.',
      );
    } finally {
      setConnectingKey(null);
    }
  }, [mutateConnectionStatus]);

  const handleDisconnectEmail = useCallback(async () => {
    setConnectingKey('email');
    try {
      await apiFetch('/marketing/connect/email', { method: 'POST', body: { enabled: false } });
      await mutateConnectionStatus();
      setEmailTestResult('Canal de email desativado para este workspace.');
    } catch (error: unknown) {
      setEmailTestResult(
        error instanceof Error ? error.message : 'Falha ao desativar o canal de email.',
      );
    } finally {
      setConnectingKey(null);
    }
  }, [mutateConnectionStatus]);

  const handleSendEmailTest = useCallback(async () => {
    setEmailTestSending(true);
    try {
      const res = await apiFetch<{ toEmail?: string; provider?: string }>(
        '/marketing/connect/email/test',
        {
          method: 'POST',
          body: { toEmail: userEmail || undefined },
        },
      );
      const payload = res?.data;
      setEmailTestResult(
        `Email de teste enviado para ${payload?.toEmail || userEmail || 'seu email'} pelo canal configurado.`,
      );
    } catch (error: unknown) {
      setEmailTestResult(
        error instanceof Error ? error.message : 'Falha ao enviar email de teste.',
      );
    } finally {
      setEmailTestSending(false);
    }
  }, [userEmail]);

  useEffect(() => {
    if (metaQueryState === 'success') {
      setConnectionMessage(
        'Conta Meta conectada com sucesso. O canal ja voltou para o Marketing no contexto certo.',
      );
    } else if (metaQueryState === 'error') {
      setConnectionMessage(
        `Falha na conexao Meta${metaQueryReason ? `: ${metaQueryReason}` : '.'}`,
      );
    }
  }, [metaQueryReason, metaQueryState]);

  const { stats: realStats } = useMarketingStats();
  const { channels: realChannels } = useMarketingChannels();
  const { messages: realFeed } = useMarketingLiveFeed();
  const { brain: realBrain } = useAIBrain();
  const { products: rawProducts } = useProducts();

  const mappedProducts = useMemo(() => mapTopProducts(rawProducts), [rawProducts]);

  const channelDataMap: Record<string, ChannelRealData> = useMemo(
    () => toChannelDataMap(realChannels),
    [realChannels],
  );

  useEffect(() => {
    if (realFeed?.length > 0) {
      const mapped = (realFeed as FeedMessageLike[]).map(formatFeedMessage);
      setFeed(mapped.slice(0, 30));
    }
  }, [realFeed]);

  const getChannelData = useCallback(
    (channelKey: string): ChannelRealData | null => {
      const cfg = CH_CONFIG[channelKey];
      if (!cfg) {
        return null;
      }
      return channelDataMap[cfg.backendKey] || null;
    },
    [channelDataMap],
  );

  const TABS = Object.freeze([
    { id: 'conversas', label: 'Conversas', icon: IC.zap },
    { id: 'whatsapp', label: 'WhatsApp', icon: IC.wa },
    { id: 'instagram', label: 'Instagram', icon: IC.ig },
    { id: 'tiktok', label: 'TikTok', icon: IC.tt },
    { id: 'facebook', label: 'Facebook', icon: IC.fb },
    { id: 'email', label: 'Email', icon: IC.em },
    { id: 'sms', label: 'SMS', icon: IC.send, soon: true },
  ]);

  const switchTab = useCallback(
    (id: string) => {
      setTab(id);
      const nextRoute = id === 'conversas' ? '/marketing' : `/marketing/${id}`;
      if (pathname === nextRoute) {
        return;
      }
      startTransition(() => {
        router.push(nextRoute);
      });
    },
    [pathname, router],
  );

  const channelTabProps = {
    connectionStatus,
    connectingKey,
    onConnectMeta: handleConnectMeta,
    onConnectEmail: handleConnectEmail,
    onDisconnectEmail: handleDisconnectEmail,
    onSendEmailTest: handleSendEmailTest,
    onRefreshConnectionStatus: () => mutateConnectionStatus(),
    emailTestSending,
    emailTestResult,
    metaConnected,
    igProfile: igProfile ?? null,
    igInsights: igInsights ?? null,
    mode: requestedMode,
    workspaceId: workspace?.id || null,
    operator: userEmail || userName || null,
  };

  return (
    <div
      style={{
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
        minHeight: '100vh',
        padding: isMobile ? 16 : 24,
      }}
    >
      <style>{`
        @keyframes mktFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mktPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes mktSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes mktGlowText { 0%, 100% { text-shadow: 0 0 20px rgba(232,93,48,0.3); } 50% { text-shadow: 0 0 40px rgba(232,93,48,0.8), 0 0 80px rgba(232,93,48,0.4); } }
        @keyframes mktTickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>

      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 8,
          maxWidth: 1240,
          marginInline: 'auto',
        }}
      >
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              fontFamily: SORA,
              fontSize: isMobile ? 11 : 12,
              padding: isMobile ? '8px 12px' : '8px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              color: tab === t.id ? EMBER : KLOEL_THEME.textSecondary,
              transition: 'all .2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {connectionMessage && (
          <div
            style={{
              marginBottom: 20,
              padding: '12px 16px',
              borderRadius: 6,
              border: `1px solid ${EMBER}30`,
              background: `${EMBER}12`,
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          >
            {connectionMessage}
          </div>
        )}

        {tab === 'conversas' && (
          <MarketingConversationsHub
            realStats={realStats}
            switchTab={switchTab}
            channelDataMap={channelDataMap}
            feedMsgs={feed}
            realBrain={realBrain}
            products={mappedProducts}
          />
        )}

        {tab === 'whatsapp' && (
          <WhatsAppMarketingTab
            channelData={getChannelData('whatsapp')}
            liveFeed={feed.filter((m) => m.includes('[whatsapp]'))}
            mode={channelTabProps.mode}
            workspaceId={channelTabProps.workspaceId}
            operator={channelTabProps.operator}
            connection={channelTabProps.connectionStatus?.channels?.whatsapp}
            onRefreshConnectionStatus={channelTabProps.onRefreshConnectionStatus}
          />
        )}

        {tab === 'instagram' && (
          <div style={{ position: 'relative' }}>
            <InstagramMarketingTab
              channelData={getChannelData('instagram')}
              connectionStatus={channelTabProps.connectionStatus}
              metaConnected={channelTabProps.metaConnected}
              onConnectMeta={(key) => channelTabProps.onConnectMeta(key)}
              connectingKey={channelTabProps.connectingKey}
            />
          </div>
        )}

        {tab === 'tiktok' && (
          <div style={{ position: 'relative' }}>
            <TikTokMarketingTab channelData={getChannelData('tiktok')} />
          </div>
        )}

        {tab === 'facebook' && (
          <div style={{ position: 'relative' }}>
            <FacebookMarketingTab
              channelData={getChannelData('facebook')}
              connectionStatus={channelTabProps.connectionStatus}
              metaConnected={channelTabProps.metaConnected}
              onConnectMeta={(key) => channelTabProps.onConnectMeta(key)}
              connectingKey={channelTabProps.connectingKey}
            />
          </div>
        )}

        {tab === 'email' && (
          <div style={{ position: 'relative' }}>
            <EmailMarketingTab
              channelData={getChannelData('email')}
              connectionStatus={channelTabProps.connectionStatus}
              mode={channelTabProps.mode}
              defaultRecipientEmail={channelTabProps.operator}
              onConnectEmail={channelTabProps.onConnectEmail}
              onDisconnectEmail={channelTabProps.onDisconnectEmail}
              onSendEmailTest={channelTabProps.onSendEmailTest}
              connectingKey={channelTabProps.connectingKey}
              emailTestSending={channelTabProps.emailTestSending}
              emailTestResult={channelTabProps.emailTestResult}
            />
          </div>
        )}

        {tab === 'sms' && (
          <div style={{ position: 'relative' }}>
            <SmsMarketingTab channelData={getChannelData('sms')} />
          </div>
        )}
      </div>
    </div>
  );
}
