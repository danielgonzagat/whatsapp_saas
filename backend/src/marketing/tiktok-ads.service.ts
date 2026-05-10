import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptMetaToken } from '../meta/meta-token-crypto';
import { asProviderSettings } from '../whatsapp/provider-settings.types';

const TIKTOK_BUSINESS_API = 'https://business-api.tiktok.com/open_api/v1.3';

interface TikTokApiResponse<T = unknown> {
  code?: number;
  message?: string;
  data?: T;
  request_id?: string;
}

interface TikTokListData<T = unknown> {
  list?: T[];
  page_info?: {
    page?: number;
    page_size?: number;
    total_number?: number;
    total_page?: number;
  };
}

interface TikTokCampaign {
  campaign_id?: string;
  campaign_name?: string;
  advertiser_id?: string;
  primary_status?: string;
  operation_status?: string;
  objective_type?: string;
  budget?: number;
  budget_mode?: string;
  create_time?: string;
  modify_time?: string;
}

interface TikTokReportRow {
  dimensions: {
    advertiser_id?: string;
    campaign_id?: string;
    stat_time_day?: string;
    [key: string]: string | undefined;
  };
  metrics: {
    spend?: number;
    impressions?: number;
    clicks?: number;
    conversion?: number;
    ctr?: number;
    cpc?: number;
    cpm?: number;
    cost_per_conversion?: number;
    video_play_actions?: number;
    [key: string]: number | undefined;
  };
}

interface TikTokProviderSubsettings {
  connected?: boolean;
  status?: string;
  kind?: string;
  accessToken?: string;
  refreshToken?: string | null;
  openId?: string | null;
  advertiserIds?: string[];
  scope?: string | null;
  expiresAt?: string | null;
  connectedAt?: string;
  [key: string]: unknown;
}

export interface FetchedTikTokCampaign {
  campaignId: string;
  campaignName: string;
  advertiserId: string;
  status: string;
}

export interface FetchedTikTokReportRow {
  advertiserId: string;
  campaignId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  videoPlayActions: number;
}

@Injectable()
export class TikTokAdsService {
  private readonly logger = new Logger(TikTokAdsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async resolveAccessToken(
    workspaceId: string,
  ): Promise<{ accessToken: string; advertiserIds: string[] }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    const tiktok = (settings.tiktok || {}) as TikTokProviderSubsettings;

    const encrypted = tiktok.accessToken;
    const accessToken = decryptMetaToken(encrypted) || encrypted;
    const advertiserIds = Array.isArray(tiktok.advertiserIds) ? tiktok.advertiserIds : [];

    if (!accessToken) {
      throw new Error(
        'tiktok_ads_not_configured: no access token found — complete OAuth via TikTok Business Center first',
      );
    }

    if (!advertiserIds.length) {
      throw new Error(
        'tiktok_ads_not_configured: no advertiser IDs found — grant advertiser access in TikTok Business Center',
      );
    }

    return { accessToken: String(accessToken), advertiserIds };
  }

  private async tiktokGet<T>(
    path: string,
    params: Record<string, unknown>,
    accessToken: string,
  ): Promise<T> {
    const url = new URL(`${TIKTOK_BUSINESS_API}${path}`);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value) || typeof value === 'object') {
        url.searchParams.set(key, JSON.stringify(value));
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        url.searchParams.set(key, String(value));
      }
    }

    this.logger.log('Calling TikTok Business API', { path, params: Object.keys(params) });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    const body = (await response.json()) as TikTokApiResponse<T>;

    if (body.code !== 0) {
      throw new Error(
        `TikTok Ads API error [${body.code}]: ${body.message || 'unknown error'} (path: ${path})`,
      );
    }

    return body.data as T;
  }

  async getCampaignsForAdvertiser(
    accessToken: string,
    advertiserId: string,
    page = 1,
    pageSize = 100,
  ): Promise<FetchedTikTokCampaign[]> {
    const campaigns: FetchedTikTokCampaign[] = [];

    try {
      let currentPage = page;
      let hasMore = true;

      while (hasMore) {
        const data = await this.tiktokGet<TikTokListData<TikTokCampaign>>(
          '/campaign/get/',
          {
            advertiser_id: advertiserId,
            page: currentPage,
            page_size: pageSize,
          },
          accessToken,
        );

        const list = data?.list ?? [];
        for (const c of list) {
          campaigns.push({
            campaignId: String(c.campaign_id || ''),
            campaignName: c.campaign_name || 'Untitled Campaign',
            advertiserId: String(c.advertiser_id || advertiserId),
            status: c.primary_status || c.operation_status || 'UNKNOWN',
          });
        }

        hasMore = Boolean(
          data?.page_info &&
          data.page_info.total_page !== undefined &&
          data.page_info.page !== undefined &&
          data.page_info.page < data.page_info.total_page,
        );
        currentPage += 1;
      }
    } catch (err) {
      this.logger.error(`Failed to fetch campaigns for advertiser ${advertiserId}`, err);
      throw err;
    }

    return campaigns;
  }

  async getReport(
    accessToken: string,
    advertiserId: string,
    startDate: string,
    endDate: string,
    page = 1,
    pageSize = 200,
  ): Promise<FetchedTikTokReportRow[]> {
    const rows: FetchedTikTokReportRow[] = [];

    try {
      let currentPage = page;
      let hasMore = true;

      const dimensions = ['advertiser_id', 'campaign_id', 'stat_time_day'];
      const metrics = [
        'spend',
        'impressions',
        'clicks',
        'conversion',
        'ctr',
        'cpc',
        'cpm',
        'cost_per_conversion',
        'video_play_actions',
      ];

      while (hasMore) {
        const data = await this.tiktokGet<TikTokListData<TikTokReportRow>>(
          '/reports/integrated/get/',
          {
            advertiser_id: advertiserId,
            service_type: 'AUCTION',
            report_type: 'BASIC',
            data_level: 'AUCTION_CAMPAIGN',
            dimensions,
            metrics,
            start_date: startDate,
            end_date: endDate,
            page: currentPage,
            page_size: pageSize,
          },
          accessToken,
        );

        const list = data?.list ?? [];
        for (const row of list) {
          const dims = row.dimensions ?? {};
          const m = row.metrics ?? {};

          rows.push({
            advertiserId: String(dims.advertiser_id || advertiserId),
            campaignId: String(dims.campaign_id || ''),
            date: String(dims.stat_time_day || startDate),
            spend: Number(m.spend || 0),
            impressions: Number(m.impressions || 0),
            clicks: Number(m.clicks || 0),
            conversions: Number(m.conversion || 0),
            ctr: Number(m.ctr || 0),
            cpc: Number(m.cpc || 0),
            cpa: Number(m.cost_per_conversion || 0),
            videoPlayActions: Number(m.video_play_actions || 0),
          });
        }

        hasMore = Boolean(
          data?.page_info &&
          data.page_info.total_page !== undefined &&
          data.page_info.page !== undefined &&
          data.page_info.page < data.page_info.total_page,
        );
        currentPage += 1;
      }
    } catch (err) {
      this.logger.error(`Failed to fetch report for advertiser ${advertiserId}`, err);
      throw err;
    }

    return rows;
  }

  async getAccessTokenAndAdvertiserIds(workspaceId: string) {
    return this.resolveAccessToken(workspaceId);
  }
}
