import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaMarketingProvider } from '../integrations/meta-marketing.provider';
import { GoogleAdsProvider } from '../integrations/google-ads.provider';
import { TikTokAdsProvider } from '../integrations/tiktok-ads.provider';
import type { AdProvider } from '../integrations/ad-provider.interface';

export interface AccountResponse {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  status: string;
  connected: boolean;
}

export interface CampaignResponse {
  id: string;
  platform: string;
  accountId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

export interface PlatformStatusResponse {
  platform: string;
  connected: boolean;
  status: string;
  accountId?: string;
  clientConfigured: boolean;
}

@Injectable()
export class AnunciosService {
  private readonly logger = new Logger(AnunciosService.name);
  private readonly providers: AdProvider[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaProvider: MetaMarketingProvider,
    private readonly googleProvider: GoogleAdsProvider,
    private readonly tiktokProvider: TikTokAdsProvider,
  ) {
    this.providers = [metaProvider, googleProvider, tiktokProvider];
  }

  private providerFor(platform: string): AdProvider | undefined {
    return this.providers.find((p) => p.platform === platform);
  }

  async getPlatformStatuses(workspaceId: string): Promise<PlatformStatusResponse[]> {
    const results = await Promise.all(
      this.providers.map(async (provider) => {
        try {
          const status = await provider.getStatus(workspaceId);
          let clientConfigured = true;
          if (provider.platform === 'meta') {
            clientConfigured = Boolean(String(process.env.META_APP_ID || '').trim());
          } else if (provider.platform === 'google') {
            clientConfigured = Boolean(String(process.env.GOOGLE_ADS_CLIENT_ID || '').trim());
          } else if (provider.platform === 'tiktok') {
            clientConfigured = Boolean(
              String(process.env.TIKTOK_CLIENT_KEY || '').trim() ||
              String(process.env.TIKTOK_CLIENT_SECRET || '').trim(),
            );
          }
          return {
            platform: provider.platform,
            connected: status.connected,
            status: status.status,
            accountId: status.accountId,
            clientConfigured,
          };
        } catch {
          return {
            platform: provider.platform,
            connected: false,
            status: 'error',
            clientConfigured: false,
          };
        }
      }),
    );
    return results;
  }

  async getConnectUrl(workspaceId: string, platform: string): Promise<{ authUrl?: string }> {
    const frontendUrl = String(process.env.FRONTEND_URL || 'https://app.kloel.com').replace(/\/+$/, '');
    const redirectUri = `${frontendUrl}/api/anuncios/callback/${platform}`;
    const provider = this.providerFor(platform);
    if (!provider) {
      return {};
    }
    const result = await provider.connect(workspaceId, redirectUri);
    return { authUrl: result.authUrl };
  }

  async completeOAuth(
    workspaceId: string,
    platform: string,
    code: string,
  ): Promise<{ connected: boolean; status: string }> {
    const frontendUrl = String(process.env.FRONTEND_URL || 'https://app.kloel.com').replace(/\/+$/, '');
    const redirectUri = `${frontendUrl}/api/anuncios/callback/${platform}`;
    const provider = this.providerFor(platform);
    if (!provider) {
      return { connected: false, status: 'unknown_platform' };
    }
    const result = await provider.completeOAuth(workspaceId, code, redirectUri);
    if (result.connected) {
      await this.syncAllForWorkspace(workspaceId);
    }
    return { connected: result.connected, status: result.status };
  }

  async getAccounts(workspaceId: string, platform?: string): Promise<AccountResponse[]> {
    const dbAccounts = await this.prisma.adAccount.findMany({
      where: {
        workspaceId,
        ...(platform ? { platform } : {}),
      },
      orderBy: { platform: 'asc' },
    });

    return dbAccounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      accountId: a.accountId,
      accountName: a.accountName ?? a.accountId,
      status: a.status,
      connected: a.status === 'connected',
    }));
  }

  async getCampaigns(workspaceId: string, platform?: string): Promise<CampaignResponse[]> {
    const dbCampaigns = await this.prisma.adCampaign.findMany({
      where: {
        workspaceId,
        ...(platform ? { platform } : {}),
      },
      orderBy: { spend: 'desc' },
    });

    return dbCampaigns.map((c) => ({
      id: c.id,
      platform: c.platform,
      accountId: c.accountId,
      campaignId: c.campaignId,
      campaignName: c.campaignName ?? c.campaignId,
      status: c.status ?? 'unknown',
      spend: c.spend,
      revenue: c.revenue,
      roas: c.roas,
      conversions: c.conversions,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      cpc: c.cpc,
    }));
  }

  async syncAccounts(workspaceId: string): Promise<AccountResponse[]> {
    const results = await Promise.allSettled(
      this.providers.map(async (provider) => {
        const syncResult = await provider.syncAccounts(workspaceId);
        for (const acc of syncResult.accounts) {
          await this.prisma.adAccount.upsert({
            where: {
              workspaceId_platform_accountId: {
                workspaceId,
                platform: acc.platform,
                accountId: acc.accountId,
              },
            },
            create: {
              workspaceId,
              platform: acc.platform,
              accountId: acc.accountId,
              accountName: acc.accountName,
              status: 'connected',
              lastSyncAt: new Date(),
            },
            update: {
              accountName: acc.accountName,
              status: 'connected',
              lastSyncAt: new Date(),
            },
          });
        }
      }),
    );

    results.forEach((r) => {
      if (r.status === 'rejected') {
        this.logger.error('Account sync failed for a provider', r.reason);
      }
    });

    return this.getAccounts(workspaceId);
  }

  async syncCampaigns(workspaceId: string): Promise<CampaignResponse[]> {
    const results = await Promise.allSettled(
      this.providers.map(async (provider) => {
        const syncResult = await provider.syncCampaigns(workspaceId);
        for (const camp of syncResult.campaigns) {
          await this.prisma.adCampaign.upsert({
            where: {
              workspaceId_platform_campaignId: {
                workspaceId,
                platform: camp.platform,
                campaignId: camp.campaignId,
              },
            },
            create: {
              workspaceId,
              accountId: camp.accountId,
              platform: camp.platform,
              campaignId: camp.campaignId,
              campaignName: camp.campaignName,
              status: camp.status,
              spend: camp.spend,
              revenue: camp.revenue,
              roas: camp.roas,
              conversions: camp.conversions,
              impressions: camp.impressions,
              clicks: camp.clicks,
              ctr: camp.ctr,
              cpc: camp.cpc,
              lastSyncAt: new Date(),
            },
            update: {
              campaignName: camp.campaignName,
              status: camp.status,
              spend: camp.spend,
              revenue: camp.revenue,
              roas: camp.roas,
              conversions: camp.conversions,
              impressions: camp.impressions,
              clicks: camp.clicks,
              ctr: camp.ctr,
              cpc: camp.cpc,
              lastSyncAt: new Date(),
            },
          });
        }
      }),
    );

    results.forEach((r) => {
      if (r.status === 'rejected') {
        this.logger.error('Campaign sync failed for a provider', r.reason);
      }
    });

    return this.getCampaigns(workspaceId);
  }

  private async syncAllForWorkspace(workspaceId: string): Promise<void> {
    try {
      await this.syncAccounts(workspaceId);
      await this.syncCampaigns(workspaceId);
    } catch (err) {
      this.logger.error('Full sync failed for workspace', err);
    }
  }
}
