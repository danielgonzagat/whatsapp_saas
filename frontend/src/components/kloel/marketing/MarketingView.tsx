'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import InboxWorkspace from '@/components/kloel/inbox/InboxWorkspace';
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
  NP,
  Ticker,
  LiveStream,
  ChannelConnectBadge,
  CH_CONFIG,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  EMBER,
  Fmt,
  FmtMoney,
  navigateCurrentWindow,
  isTrustedMetaOauthUrl,
  formatFeedMessage,
} from './MarketingShared';
import type {
  ChannelRealData,
  AIBrainInfo,
  MarketingConnectStatus,
  FeedMessageLike,
  IgProfileData,
  IgInsightsData,
} from './MarketingTypes';

import WhatsAppMarketingTab from './WhatsAppMarketingTab';
import InstagramMarketingTab from './InstagramMarketingTab';
import TikTokMarketingTab from './TikTokMarketingTab';
import FacebookMarketingTab from './FacebookMarketingTab';
import EmailMarketingTab from './EmailMarketingTab';
import SmsMarketingTab from './SmsMarketingTab';

interface RawProductLike {
  name?: string;
  title?: string;
  price?: number;
  amount?: number;
  sold?: number;
  quantitySold?: number;
  sales?: number;
  img?: string;
  emoji?: string;
  image?: string;
}

interface MappedProduct {
  name: string;
  price: number;
  sold: number;
  img: string;
}

function mapTopProducts(rawProducts: unknown): MappedProduct[] {
  if (!rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) {
    return [];
  }
  return (rawProducts as RawProductLike[]).slice(0, 3).map((p) => ({
    name: p.name || p.title || 'Produto',
    price: p.price ?? p.amount ?? 0,
    sold: p.sold ?? p.quantitySold ?? p.sales ?? 0,
    img: p.img || p.emoji || p.image || '\uD83D\uDCE6',
  }));
}

function toChannelDataMap(realChannels: unknown): Record<string, ChannelRealData> {
  if (!realChannels || typeof realChannels !== 'object') {
    return {};
  }
  const map: Record<string, ChannelRealData> = {};
  for (const [key, val] of Object.entries(realChannels as Record<string, unknown>)) {
    if (val && typeof val === 'object') {
      map[key] = val as ChannelRealData;
    }
  }
  return map;
}

function isBrainAvgResponseMeaningful(
  avgResponseTime: string | number | null | undefined,
): boolean {
  if (typeof avgResponseTime === 'number') {
    return avgResponseTime > 0;
  }
  if (typeof avgResponseTime === 'string') {
    const trimmed = avgResponseTime.trim();
    return trimmed !== '' && trimmed !== '--';
  }
  return false;
}

interface ChannelNerveRowProps {
  channelKey: string;
  cfg: (typeof CH_CONFIG)[string];
  data: ChannelRealData | undefined;
  isMobile: boolean;
  onOpen: (id: string) => void;
}

function ChannelNerveRow({ channelKey, cfg, data, isMobile, onOpen }: ChannelNerveRowProps) {
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

function RevenueBarChart({ channelDataMap }: { channelDataMap: Record<string, ChannelRealData> }) {
  const bars = Object.entries(CH_CONFIG).map(([key, ch]) => {
    const data = channelDataMap[ch.backendKey];
    return { key, label: ch.label, color: ch.color, sales: data?.sales ?? 0 };
  });
  const maxSales = Math.max(1, ...bars.map((b) => b.sales));

  return (
    <div
      style={{ background: BG_CARD, borderRadius: 6, padding: 16, border: `1px solid ${BORDER}` }}
    >
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: 'var(--app-text-tertiary)',
          marginBottom: 14,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
        }}
      >
        {kloelT(`Receita por Canal`)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
        {bars.map((b) => (
          <div
            key={b.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: b.color }}>{b.sales}</span>
            <div
              style={{
                width: '100%',
                maxWidth: 40,
                background: `${b.color}30`,
                borderRadius: '4px 4px 0 0',
                height: Math.max(4, (b.sales / maxSales) * 90),
                transition: 'height .5s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: b.color,
                  opacity: 0.6,
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: SORA,
                fontSize: 9,
                color: 'var(--app-text-secondary)',
                textAlign: 'center',
              }}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisaoGeral({
  realStats,
  switchTab,
  channelDataMap,
  feedMsgs,
  realBrain,
  products,
}: {
  realStats: {
    totalMessages: number;
    totalLeads: number;
    totalSales: number;
    totalRevenue: number;
  };
  switchTab: (id: string) => void;
  channelDataMap: Record<string, ChannelRealData>;
  feedMsgs: string[];
  realBrain: AIBrainInfo | null;
  products: { name: string; price: number; sold: number; img: string }[];
}) {
  const { isMobile } = useResponsiveViewport();
  const tickerItems = feedMsgs.length > 0 ? feedMsgs : ['Aguardando mensagens...'];

  return (
    <div>
      <div
        style={{
          textAlign: 'center',
          padding: isMobile ? '24px 18px' : '32px 24px',
          marginBottom: 24,
          borderRadius: 6,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: 'var(--app-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.25em',
          }}
        >
          {kloelT(`RECEITA TOTAL GERADA PELA IA`)}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: isMobile ? 44 : 80,
            fontWeight: 700,
            color: EMBER,
            marginTop: 8,
          }}
        >
          <span>{FmtMoney(realStats.totalRevenue)}</span>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: isMobile ? 11 : 12,
            color: 'var(--app-text-secondary)',
            marginTop: 4,
            lineHeight: 1.5,
            padding: isMobile ? '0 12px' : 0,
          }}
        >
          {Fmt(realStats.totalMessages)} {kloelT(`msgs &middot;`)} {Fmt(realStats.totalLeads)}{' '}
          {kloelT(`leads &middot;`)} {realStats.totalSales} vendas
        </div>
      </div>

      <Ticker items={tickerItems} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20 }}>
        {Object.entries(CH_CONFIG).map(([key, ch]) => (
          <ChannelNerveRow
            key={key}
            channelKey={key}
            cfg={ch}
            data={channelDataMap[ch.backendKey]}
            isMobile={isMobile}
            onOpen={switchTab}
          />
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <RevenueBarChart channelDataMap={channelDataMap} />
      </div>

      <div
        style={{
          marginTop: 24,
          background: BG_CARD,
          borderRadius: 6,
          padding: 16,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            color: 'var(--app-text-tertiary)',
            marginBottom: 12,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
          }}
        >
          {kloelT(`Produtos Mais Vendidos`)}
        </div>
        <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
          {products.length === 0 ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                padding: 14,
              }}
            >
              {kloelT(`Nenhum produto cadastrado`)}
            </div>
          ) : (
            products.map((p) => (
              <div
                key={p.name}
                style={{
                  flex: 1,
                  background: BG_CARD,
                  borderRadius: 6,
                  padding: 14,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  border: `1px solid ${BORDER}`,
                }}
              >
                <div style={{ fontSize: 28 }}>{p.img}</div>
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: EMBER }}>
                    {FmtMoney(p.price)}
                  </div>
                  <div
                    style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}
                  >
                    {p.sold} vendidos
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16,
          marginTop: 20,
        }}
      >
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div style={{ color: EMBER, animation: 'mktPulse 3s infinite', marginBottom: 12 }}>
            {IC.zap(40)}
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 16,
              color: 'var(--app-text-primary)',
              marginBottom: 4,
            }}
          >
            {kloelT(`Cerebro IA`)} {realBrain?.status === 'active' ? 'Ativo' : 'Inativo'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
            {realBrain?.activeConversations ?? 0} {kloelT(`conversas ativas`)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 18, color: 'var(--app-text-primary)' }}>
                {realBrain?.productsLoaded ?? 0}
              </div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 9,
                  color: 'var(--app-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {kloelT(`Produtos`)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 18, color: 'var(--app-text-primary)' }}>
                {realBrain?.objectionsMapped ?? 0}
              </div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 9,
                  color: 'var(--app-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {kloelT(`Objecoes`)}
              </div>
            </div>
          </div>
          {isBrainAvgResponseMeaningful(
            realBrain?.avgResponseTime as string | number | null | undefined,
          ) ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginTop: 6,
              }}
            >
              {kloelT(`Tempo medio:`)} {String(realBrain?.avgResponseTime)}
            </div>
          ) : null}
          <NP w={200} h={24} color={EMBER} />
        </div>

        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 16,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              marginBottom: 12,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Feed em Tempo Real`)}
          </div>
          {feedMsgs.length === 0 ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                padding: 14,
              }}
            >
              {kloelT(`Aguardando mensagens...`)}
            </div>
          ) : (
            <LiveStream msgs={feedMsgs} color={EMBER} />
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationsHub({
  realStats,
  switchTab,
  channelDataMap,
  feedMsgs,
  realBrain,
  products,
}: {
  realStats: {
    totalMessages: number;
    totalLeads: number;
    totalSales: number;
    totalRevenue: number;
  };
  switchTab: (id: string) => void;
  channelDataMap: Record<string, ChannelRealData>;
  feedMsgs: string[];
  realBrain: AIBrainInfo | null;
  products: { name: string; price: number; sold: number; img: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <VisaoGeral
          realStats={realStats}
          switchTab={switchTab}
          channelDataMap={channelDataMap}
          feedMsgs={feedMsgs}
          realBrain={realBrain}
          products={products}
        />
      </section>

      <section>
        <InboxWorkspace embedded showHeader={false} showContextBanner={false} />
      </section>
    </div>
  );
}

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
        'Email ativado com sucesso. Agora voce pode enviar campanhas e testar o provider.',
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
        `Email de teste enviado para ${payload?.toEmail || userEmail || 'seu email'} via ${payload?.provider || 'provider configurado'}.`,
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
      if (!cfg) return null;
      return channelDataMap[cfg.backendKey] || null;
    },
    [channelDataMap],
  );

  const TABS = Object.freeze([
    { id: 'conversas', label: 'Conversas', icon: IC.zap },
    { id: 'whatsapp', label: 'WhatsApp', icon: IC.wa },
    { id: 'instagram', label: 'Instagram', icon: IC.ig, soon: true },
    { id: 'tiktok', label: 'TikTok', icon: IC.tt, soon: true },
    { id: 'facebook', label: 'Facebook', icon: IC.fb, soon: true },
    { id: 'email', label: 'Email', icon: IC.em, soon: true },
    { id: 'sms', label: 'SMS', icon: IC.send, soon: true },
  ]);

  const switchTab = useCallback(
    (id: string) => {
      setTab(id);
      const nextRoute = id === 'conversas' ? '/marketing' : `/marketing/${id}`;
      if (pathname === nextRoute) return;
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
            {t.soon && (
              <span
                style={{
                  fontSize: 8,
                  color: 'var(--app-text-tertiary)',
                  fontFamily: MONO,
                  marginLeft: 2,
                }}
              >
                soon
              </span>
            )}
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
          <ConversationsHub
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
