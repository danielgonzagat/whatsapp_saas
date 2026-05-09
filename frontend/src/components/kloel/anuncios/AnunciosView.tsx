'use client';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, startTransition, useCallback } from 'react';
import { metaAdsApi } from '@/lib/api/meta';
import {
  useAnunciosStatus,
  useAnunciosAccounts,
  useAnunciosCampaigns,
} from '@/hooks/useAnuncios';
import type { AnunciosPlatformStatus, AnunciosAccount } from '@/hooks/useAnuncios';
import { AnunciosTabBar, ROUTES } from './AnunciosTabBar';
import { WarRoomDashboard } from './WarRoomDashboard';
import { PlatformDetailTab } from './PlatformDetailTab';
import { TrackingDashboard } from './TrackingDashboard';
import { RuleEngineHub } from './RuleEngineHub';
import { SORA } from './AnunciosShared';
import type { Campaign, PlatformKey, PlatformData } from './anuncios-types';
import { PLATFORM_DEFAULTS } from './anuncios-types';

function mapApiCampaignToView(c: AnunciosAccount | Record<string, unknown>): Campaign {
  const platform = (typeof c.platform === 'string' ? c.platform : 'meta') as PlatformKey;
  const campaignId = typeof c.campaignId === 'string' ? c.campaignId : String(c.id || '');
  return {
    id: campaignId,
    platform,
    name: typeof c.campaignName === 'string' ? c.campaignName : campaignId,
    status: typeof c.status === 'string' ? c.status.toLowerCase() : 'unknown',
    spend: typeof c.spend === 'number' ? c.spend : 0,
    revenue: typeof c.revenue === 'number' ? c.revenue : 0,
    roas: typeof c.roas === 'number' ? c.roas : 0,
    conv: typeof c.conversions === 'number' ? c.conversions : 0,
    ctr: typeof c.ctr === 'number' ? c.ctr : 0,
    cpc: typeof c.cpc === 'number' ? c.cpc : 0,
    trend: (typeof c.roas === 'number' ? c.roas : 0) > 1 ? 'up' : 'down',
  };
}

function buildPlatformsFromStatuses(statuses: AnunciosPlatformStatus[]): Record<PlatformKey, PlatformData> {
  const result = { ...PLATFORM_DEFAULTS } as Record<PlatformKey, PlatformData>;
  for (const s of statuses) {
    if (s.platform === 'meta' || s.platform === 'google' || s.platform === 'tiktok') {
      result[s.platform] = {
        ...result[s.platform],
        connected: s.connected,
      };
    }
  }
  return result;
}

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

  const { statuses } = useAnunciosStatus();
  const { accounts } = useAnunciosAccounts();
  const { campaigns: apiCampaigns } = useAnunciosCampaigns();

  const [platforms, setPlatforms] = useState<Record<PlatformKey, PlatformData>>(PLATFORM_DEFAULTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    if (statuses.length > 0) {
      setPlatforms((prev) => buildPlatformsFromStatuses(statuses));
    }
  }, [statuses]);

  useEffect(() => {
    setCampaigns(
      apiCampaigns.length > 0
        ? apiCampaigns.map((c) => mapApiCampaignToView(c as unknown as Record<string, unknown>))
        : [],
    );
  }, [apiCampaigns]);

  const metaConnected = statuses.find((s) => s.platform === 'meta')?.connected ?? false;

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
      if (!metaConnected || campaign.platform !== 'meta') return;
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
    [metaConnected],
  );

  const handleConnectPlatform = useCallback(
    (platformKey: PlatformKey) => {
      const routeMap: Record<PlatformKey, string> = {
        meta: '/conta',
        google: `/anuncios/google`,
        tiktok: `/anuncios/tiktok`,
      };
      window.location.href = routeMap[platformKey];
    },
    [],
  );

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
            onConnectPlatform={handleConnectPlatform}
            onToggleCampaign={handleCampaignToggle}
            metaConnected={metaConnected}
          />
        )}
        {tab === 'meta' && (
          <PlatformDetailTab
            platformKey="meta"
            platform={platforms.meta}
            campaigns={campaigns.filter((c) => c.platform === 'meta')}
            metaAccessToken={metaConnected ? 'connected' : undefined}
            onCampaignsChange={setCampaigns}
          />
        )}
        {tab === 'google' && (
          <PlatformDetailTab
            platformKey="google"
            platform={platforms.google}
            campaigns={campaigns.filter((c) => c.platform === 'google')}
            onCampaignsChange={setCampaigns}
          />
        )}
        {tab === 'tiktok' && (
          <PlatformDetailTab
            platformKey="tiktok"
            platform={platforms.tiktok}
            campaigns={campaigns.filter((c) => c.platform === 'tiktok')}
            onCampaignsChange={setCampaigns}
          />
        )}
        {tab === 'track' && <TrackingDashboard focus={requestedFocus} />}
        {tab === 'rules' && <RuleEngineHub />}
      </div>
    </div>
  );
}
