'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, startTransition, useCallback } from 'react';
import { metaAdsApi } from '@/lib/api/meta';
import { apiFetch } from '@/lib/api';
import { useAnunciosStatus, useAnunciosCampaigns } from '@/hooks/useAnuncios';
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

function buildPlatformsFromStatuses(
  statuses: AnunciosPlatformStatus[],
  apiCampaigns: AnunciosCampaign[] = [],
): Record<PlatformKey, PlatformData> {
  const result = { ...PLATFORM_DEFAULTS } as Record<PlatformKey, PlatformData>;
  for (const s of statuses) {
    if (s.platform === 'meta' || s.platform === 'google' || s.platform === 'tiktok') {
      result[s.platform] = {
        ...result[s.platform],
        connected: s.connected,
      };
    }
  }
  // Aggregate the fetched campaign metrics into each platform's headline cards;
  // without this the War Room shows 0/--- even with synced campaigns.
  for (const key of ['meta', 'google', 'tiktok'] as PlatformKey[]) {
    const rows = apiCampaigns.filter((c) => ((c.platform || 'meta') as PlatformKey) === key);
    if (rows.length === 0) {
      continue;
    }
    const spend = rows.reduce((a, c) => a + (c.spend || 0), 0);
    const revenue = rows.reduce((a, c) => a + (c.revenue || 0), 0);
    const conversions = rows.reduce((a, c) => a + (c.conversions || 0), 0);
    const impressions = rows.reduce((a, c) => a + (c.impressions || 0), 0);
    const clicks = rows.reduce((a, c) => a + (c.clicks || 0), 0);
    result[key] = {
      ...result[key],
      spend,
      revenue,
      conversions,
      impressions,
      clicks,
      roas: spend > 0 ? revenue / spend : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
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
      queueMicrotask(() => setTab(defaultTab as TabId));
      prevDefault.current = defaultTab;
    }
  }, [defaultTab]);

  useEffect(() => {
    if (requestedFocus && tab !== 'track') {
      queueMicrotask(() => setTab('track'));
    }
  }, [requestedFocus, tab]);

  const { statuses } = useAnunciosStatus();
  const { campaigns: apiCampaigns } = useAnunciosCampaigns();

  const [platforms, setPlatforms] = useState<Record<PlatformKey, PlatformData>>(PLATFORM_DEFAULTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    if (statuses.length > 0 || apiCampaigns.length > 0) {
      queueMicrotask(() => setPlatforms(buildPlatformsFromStatuses(statuses, apiCampaigns)));
    }
  }, [statuses, apiCampaigns]);

  useEffect(() => {
    queueMicrotask(() => {
      setCampaigns(apiCampaigns.length > 0 ? apiCampaigns.map(mapApiCampaignToView) : []);
    });
  }, [apiCampaigns]);

  useEffect(() => {
    const fetchSyncStatus = async () => {
      try {
        const syncData = await apiFetch<{
          data?: { meta?: { lastCampaignSync?: string; lastAccountSync?: string } };
        }>('/api/anuncios/sync-status/meta');
        const metaSync = syncData?.data?.data?.meta;
        if (metaSync) {
          const ts = metaSync.lastCampaignSync || metaSync.lastAccountSync;
          if (ts) {
            setLastSyncAt(new Date(ts).toLocaleString('pt-BR'));
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
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformKey | null>(null);

  const navigateTo = useCallback(
    (nextRoute: string) => {
      if (pathname === nextRoute) {
        return;
      }
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
      if (!metaConnected || campaign.platform !== 'meta') {
        return;
      }
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

  const handleConnectPlatform = useCallback(async (platformKey: PlatformKey) => {
    setConnectingPlatform(platformKey);
    setConnectError(null);
    try {
      const { buildAdPlatformConnectRequest, readOfficialConnectUrl } = await import(
        './AnunciosConnect.helpers'
      );
      const request = buildAdPlatformConnectRequest(platformKey);
      const response = await apiFetch<{ url?: string }>(request.endpoint);
      window.location.assign(readOfficialConnectUrl(response, request));
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Falha ao abrir conexão oficial.');
      setConnectingPlatform(null);
    }
  }, []);

  return (
    <div style={{ fontFamily: SORA, color: 'var(--app-text-primary)', minHeight: '100vh' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: isMobile ? '16px 16px 8px' : '24px 24px 8px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 700 }}>
          {kloelT('Anúncios')}
        </h1>
      </div>

      <AnunciosTabBar tab={tab} isMobile={isMobile} onSelect={goToTab} />

      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1240, margin: '0 auto' }}>
        {connectError ? (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              border: '1px solid rgba(232,93,48,.28)',
              borderRadius: 6,
              background: 'rgba(232,93,48,.08)',
              color: 'var(--app-text-secondary)',
              fontSize: 12,
            }}
          >
            {connectError}
          </div>
        ) : null}
        {!metaConnected && tab === 'visao' ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              borderBottom: '1px solid var(--app-border)',
              animation: 'fadeIn 0.5s ease',
            }}
          >
            <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--app-text-secondary)' }}>
              {kloelT('Conecte sua conta Meta para visualizar campanhas e insights reais.')}
            </div>
            <button
              type="button"
              disabled={connectingPlatform === 'meta'}
              onClick={() => handleConnectPlatform('meta')}
              style={{
                cursor: connectingPlatform === 'meta' ? 'wait' : 'pointer',
                opacity: connectingPlatform === 'meta' ? 0.72 : 1,
                padding: '10px 28px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderRadius: 4,
                background: 'rgb(24, 119, 242)',
                color: 'rgb(255, 255, 255)',
                fontFamily: SORA,
              }}
            >
              {connectingPlatform === 'meta' ? kloelT('Abrindo Meta Ads...') : kloelT('Conectar Meta Ads')}
            </button>
          </div>
        ) : lastSyncAt ? (
          <div
            style={{
              padding: '6px 16px',
              fontSize: 12,
              color: 'var(--app-text-tertiary)',
              textAlign: 'right',
            }}
          >
            {kloelT('Última sincronização:')} {lastSyncAt}
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
            onConnectPlatform={handleConnectPlatform}
          />
        )}
        {tab === 'google' && (
          <PlatformDetailTab
            platformKey="google"
            platform={platforms.google}
            campaigns={campaigns.filter((c) => c.platform === 'google')}
            onCampaignsChange={setCampaigns}
            onConnectPlatform={handleConnectPlatform}
          />
        )}
        {tab === 'tiktok' && (
          <PlatformDetailTab
            platformKey="tiktok"
            platform={platforms.tiktok}
            campaigns={campaigns.filter((c) => c.platform === 'tiktok')}
            onCampaignsChange={setCampaigns}
            onConnectPlatform={handleConnectPlatform}
          />
        )}
        {tab === 'track' && <TrackingDashboard focus={requestedFocus ?? ''} />}
        {tab === 'rules' && <RuleEngineHub />}
      </div>
    </div>
  );
}
