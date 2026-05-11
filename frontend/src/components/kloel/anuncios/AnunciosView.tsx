'use client';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, startTransition, useCallback } from 'react';
import { metaAdsApi } from '@/lib/api/meta';
import {
  useAnunciosStatus,
  useAnunciosCampaigns,
} from '@/hooks/useAnuncios';
import type { AnunciosPlatformStatus, AnunciosCampaign } from '@/hooks/useAnuncios';
import { AnunciosTabBar, ROUTES } from './AnunciosTabBar';
import { WarRoomDashboard } from './WarRoomDashboard';
import { PlatformDetailTab } from './PlatformDetailTab';
import { TrackingDashboard } from './TrackingDashboard';
import { RuleEngineHub } from './RuleEngineHub';
import { SORA } from './AnunciosShared';
import type { Campaign, PlatformKey, PlatformData, TabId } from './anuncios-types';
import { PLATFORM_DEFAULTS } from './anuncios-types';

function mapApiCampaignToView(c: AnunciosCampaign): Campaign {
  return {
    id: c.campaignId,
    platform: (c.platform || 'meta') as PlatformKey,
    name: c.campaignName || c.campaignId,
    status: c.status.toLowerCase(),
    spend: c.spend,
    revenue: c.revenue,
    roas: c.roas,
    conv: c.conversions,
    ctr: c.ctr,
    cpc: c.cpc,
    trend: c.roas > 1 ? 'up' : 'down',
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
  const { campaigns: apiCampaigns } = useAnunciosCampaigns();

  const [platforms, setPlatforms] = useState<Record<PlatformKey, PlatformData>>(PLATFORM_DEFAULTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    if (statuses.length > 0) {
      setPlatforms(buildPlatformsFromStatuses(statuses));
    }
  }, [statuses]);

  useEffect(() => {
    setCampaigns(
      apiCampaigns.length > 0
        ? apiCampaigns.map(mapApiCampaignToView)
        : [],
    );
  }, [apiCampaigns]);

  useEffect(() => {
    const fetchSyncStatus = async () => {
      try {
        const metaAdsResp = await fetch('/api/anuncios/sync-status/meta');
        if (metaAdsResp.ok) {
          const syncData = await metaAdsResp.json();
          const metaSync = syncData?.data?.meta;
          if (metaSync) {
            const ts = metaSync.lastCampaignSync || metaSync.lastAccountSync;
            if (ts) {
              setLastSyncAt(new Date(ts).toLocaleString('pt-BR'));
            }
          }
        }
      } catch {
        void 0;
      }
    };
    fetchSyncStatus();
  }, [apiCampaigns]);

  const metaConnected = statuses.find((s) => s.platform === 'meta')?.connected ?? false;
  const metaTokenProp = metaConnected ? 'connected' : '';

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
        {!metaConnected && tab === 'visao' ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            borderBottom: '1px solid var(--app-border)',
            animation: 'fadeIn 0.5s ease',
          }}>
            <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--app-text-secondary)' }}>
              Conecte sua conta Meta para visualizar campanhas e insights reais.
            </div>
            <button
              type="button"
              onClick={() => handleConnectPlatform('meta')}
              style={{
                cursor: 'pointer',
                padding: '10px 28px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderRadius: 4,
                background: '#1877F2',
                color: '#fff',
                fontFamily: SORA,
              }}
            >
              Conectar Meta Ads
            </button>
          </div>
        ) : lastSyncAt ? (
          <div style={{
            padding: '6px 16px',
            fontSize: 12,
            color: 'var(--app-text-tertiary)',
            textAlign: 'right',
          }}>
            Última sincronização: {lastSyncAt}
          </div>
        ) : null}
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
            metaAccessToken={metaTokenProp}
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
        {tab === 'track' && <TrackingDashboard focus={requestedFocus ?? ''} />}
        {tab === 'rules' && <RuleEngineHub />}
      </div>
    </div>
  );
}
