'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo } from 'react';

import { SORA, EMBER } from './MarketingShared';
import type { ChannelKey } from './OfficialMarketingChannelPage.helpers';
import { OfficialMarketingChannelPage } from './OfficialMarketingChannelPage';

/**
 * The Marketing module menu has exactly five items, always in this order and
 * always uppercase (spec §1 / §10). "Conversas" left the menu permanently —
 * the unified inbox is the canonical messages surface (spec §15), so the
 * index route and any /marketing/conversas link redirect there.
 */
const CHANNELS: readonly ChannelKey[] = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'email'];
const CHANNEL_LABEL: Record<ChannelKey, string> = {
  whatsapp: 'WHATSAPP',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  facebook: 'FACEBOOK',
  email: 'EMAIL',
};

function resolveChannel(tab: string): ChannelKey {
  return (CHANNELS as readonly string[]).includes(tab) ? (tab as ChannelKey) : 'whatsapp';
}

export default function MarketingView({ defaultTab = 'whatsapp' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The route is the single source of truth for the active channel: the
  // pathname segment updates instantly on client navigation, with the
  // server-provided defaultTab as the fallback. No local mirror state.
  const channel: ChannelKey = useMemo(() => {
    const segment = (pathname || '').split('/').filter(Boolean).pop() || '';
    return (CHANNELS as readonly string[]).includes(segment)
      ? (segment as ChannelKey)
      : resolveChannel(defaultTab);
  }, [pathname, defaultTab]);

  // The unified inbox owns conversations now — anyone landing on the retired
  // /marketing or /marketing/conversas path is sent there transparently.
  useEffect(() => {
    if (pathname === '/marketing/conversas') {
      router.replace('/inbox');
    } else if (pathname === '/marketing') {
      router.replace('/marketing/whatsapp');
    }
  }, [pathname, router]);

  const metaState = searchParams?.get('meta') || null;
  const metaReason = searchParams?.get('reason') || null;
  const connectionMessage = useMemo(() => {
    if (metaState === 'success') {
      return 'Conta conectada com sucesso. O canal voltou ao Marketing no contexto certo.';
    }
    if (metaState === 'error') {
      return `Falha na conexão${metaReason ? `: ${metaReason}` : '.'}`;
    }
    return null;
  }, [metaState, metaReason]);

  // When the provider OAuth returns with ?meta=success the channel just gained
  // its identity — advance the canonical screen to the products step.
  const initialStep = metaState === 'success' ? 1 : undefined;

  const switchChannel = useCallback(
    (next: ChannelKey) => {
      const route = `/marketing/${next}`;
      if (pathname === route) {
        return;
      }
      startTransition(() => {
        router.push(route);
      });
    },
    [pathname, router],
  );

  return (
    <div
      style={{
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
        minHeight: '100vh',
        padding: isMobile ? 16 : 24,
      }}
    >
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
        {CHANNELS.map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => switchChannel(c)}
            style={{
              fontFamily: SORA,
              fontSize: isMobile ? 11 : 12,
              letterSpacing: 1,
              padding: isMobile ? '8px 12px' : '8px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: 'transparent',
              color: channel === c ? EMBER : KLOEL_THEME.textSecondary,
              transition: 'all .2s',
            }}
          >
            {CHANNEL_LABEL[c]}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {connectionMessage ? (
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
        ) : null}

        <OfficialMarketingChannelPage
          key={channel}
          channel={channel}
          {...(initialStep !== undefined ? { initialStep } : {})}
        />
      </div>
    </div>
  );
}
