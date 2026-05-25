'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo } from 'react';

import type { ChannelKey } from './OfficialMarketingChannelPage.helpers';
import { OfficialMarketingChannelPage } from './OfficialMarketingChannelPage';
import { PreviewBar } from './OfficialMarketingChannelPage/ChannelOnboarding/preview-bar';
import { useOnboardingPalette } from './OfficialMarketingChannelPage/ChannelOnboarding/use-onboarding-palette';

/**
 * The Marketing module is intentionally a thin pass-through: the surrounding
 * shell must not add padding, container width or a competing navigation row,
 * because the canonical ChannelOnboarding design (PreviewBar + onboarding
 * screen) is the entire content of the route. Any wrapper layout here would
 * fight the contract.
 *
 * The view sets the canvas — repaints it with the palette's `void` color from
 * the first pixel of the content area — and renders the PreviewBar floating
 * over it. The onboarding screen lives below.
 */
const CHANNELS: readonly ChannelKey[] = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'email'];

function resolveChannel(tab: string): ChannelKey {
  return (CHANNELS as readonly string[]).includes(tab) ? (tab as ChannelKey) : 'whatsapp';
}

export default function MarketingView({ defaultTab = 'whatsapp' }: { defaultTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const C = useOnboardingPalette();

  const channel: ChannelKey = useMemo(() => {
    const segment = (pathname || '').split('/').filter(Boolean).pop() || '';
    return (CHANNELS as readonly string[]).includes(segment)
      ? (segment as ChannelKey)
      : resolveChannel(defaultTab);
  }, [pathname, defaultTab]);

  useEffect(() => {
    if (pathname === '/marketing/conversas') {
      router.replace('/inbox');
    } else if (pathname === '/marketing') {
      router.replace('/marketing/whatsapp');
    }
  }, [pathname, router]);

  const metaState = searchParams?.get('meta') || null;
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
        background: C.void,
        minHeight: '100vh',
        position: 'relative',
      }}
    >
      <PreviewBar active={channel} onChange={switchChannel} C={C} />
      <OfficialMarketingChannelPage
        key={channel}
        channel={channel}
        {...(initialStep !== undefined ? { initialStep } : {})}
      />
    </div>
  );
}
