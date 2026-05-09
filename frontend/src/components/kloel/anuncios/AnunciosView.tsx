'use client';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, startTransition, useCallback } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { metaAdsApi } from '@/lib/api/meta';
import {
  emptyPlatformMetrics,
  extractMetaPlatformMetrics,
  extractMetaCampaignsFromResponse,
  mapMetaCampaign,
} from './AnunciosView.helpers';
import { AnunciosTabBar, ROUTES } from './AnunciosTabBar';
import { WarRoomDashboard } from './WarRoomDashboard';
import { PlatformDetailTab } from './PlatformDetailTab';
import { TrackingDashboard } from './TrackingDashboard';
import { RuleEngineHub } from './RuleEngineHub';
import { SORA } from './AnunciosShared';
import type { Campaign, PlatformKey, PlatformData, TabId } from './anuncios-types';
import { PLATFORM_DEFAULTS } from './anuncios-types';

export default function AnunciosView({ defaultTab = 'visao' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(defaultTab as TabId);
  const requestedFocus = searchParams?.get('focus') || undefined;
  const prevDefault = useRef(defaultTab);

  useEffect(() => {
    if (prevDefault.current !== defaultTab) {
      setTab(defaultTab as TabId);
      prevDefault.current = defaultTab;
    }
  }, [defaultTab]);

  useEffect(() => {
    if (requestedFocus && tab !== 'track') {
      setTab('track');
    }
  }, [requestedFocus, tab]);

  const [platforms, setPlatforms] = useState<Record<PlatformKey, PlatformData>>(PLATFORM_DEFAULTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const { data: metaStatus } = useSWR<Record<string, unknown>>('/meta/auth/status', swrFetcher);
  const metaConnected = metaStatus?.connected === true;

  const { data: metaInsights } = useSWR<Record<string, unknown>>(
    metaConnected ? '/meta/ads/insights/account' : null,
    swrFetcher,
  );
  const { data: metaCampaigns } = useSWR<Record<string, unknown>>(
    metaConnected ? '/meta/ads/campaigns' : null,
    swrFetcher,
  );

  useEffect(() => {
    const metaMetrics =
      metaConnected && metaInsights
        ? extractMetaPlatformMetrics(metaInsights as Record<string, unknown>)
        : emptyPlatformMetrics();
    setPlatforms((prev) => ({
      ...prev,
      meta: { ...prev.meta, ...metaMetrics },
    }));
  }, [metaConnected, metaInsights]);

  useEffect(() => {
    const raw = extractMetaCampaignsFromResponse(metaCampaigns);
    setCampaigns(
      metaConnected && raw.length > 0 ? raw.map(mapMetaCampaign) : [],
    );
  }, [metaConnected, metaCampaigns]);

  const metaAccessToken: string | undefined =
    typeof metaStatus?.accessToken === 'string'
      ? (metaStatus.accessToken as string)
      : typeof metaStatus?.token === 'string'
        ? (metaStatus.token as string)
        : undefined;

  const navigateTo = useCallback(
    (nextRoute: string) => {
      if (pathname === nextRoute) return;
      startTransition(() => {
        router.push(nextRoute);
      });
    },
    [pathname, router],
  );

  const goToRules = useCallback(() => {
    setTab('rules');
    navigateTo(ROUTES.rules);
  }, [navigateTo]);

  const goToTab = useCallback(
    (id: string) => {
      setTab(id as TabId);
      navigateTo(ROUTES[id as TabId] || '/anuncios');
    },
    [navigateTo],
  );

  const handleCampaignToggle = useCallback(
    async (campaign: Campaign) => {
      if (!metaAccessToken) return;
      const newStatus = campaign.status === 'active' ? 'PAUSED' : 'ACTIVE';
      await metaAdsApi.updateCampaignStatus(campaign.id, newStatus);
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaign.id
            ? { ...c, status: newStatus.toLowerCase() === 'active' ? 'active' : 'paused' }
            : c,
        ),
      );
    },
    [metaAccessToken],
  );

  const handleConnectMeta = useCallback(() => {
    window.location.href = '/conta';
  }, []);

  return (
    <div style={{ fontFamily: SORA, color: 'var(--app-text-primary)', minHeight: '100vh' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <AnunciosTabBar tab={tab} isMobile={isMobile} onSelect={goToTab} />

      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1240, margin: '0 auto' }}>
        {tab === 'visao' && (
          <WarRoomDashboard
            platforms={platforms}
            campaigns={campaigns}
            onGoToRules={goToRules}
            onConnectMeta={handleConnectMeta}
            onToggleCampaign={handleCampaignToggle}
            metaAccessToken={metaAccessToken}
          />
        )}
        {tab === 'meta' && (
          <PlatformDetailTab
            platformKey="meta"
            platform={platforms.meta}
            campaigns={campaigns}
            metaAccessToken={metaAccessToken}
            onCampaignsChange={setCampaigns}
          />
        )}
        {tab === 'google' && (
          <PlatformDetailTab
            platformKey="google"
            platform={platforms.google}
            campaigns={campaigns}
            onCampaignsChange={setCampaigns}
          />
        )}
        {tab === 'tiktok' && (
          <PlatformDetailTab
            platformKey="tiktok"
            platform={platforms.tiktok}
            campaigns={campaigns}
            onCampaignsChange={setCampaigns}
          />
        )}
        {tab === 'track' && <TrackingDashboard focus={requestedFocus} />}
        {tab === 'rules' && <RuleEngineHub />}
      </div>
    </div>
  );
}
