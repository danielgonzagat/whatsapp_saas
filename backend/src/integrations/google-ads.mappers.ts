import type {
  AdAccountSyncResult,
  AdCampaignSyncResult,
  AdInsightSyncResult,
} from './ad-provider.interface';
import { GOOGLE_ADS_PLATFORM } from './google-ads.helpers';

export function buildGoogleAdsAccount(
  customerId: string,
  descriptiveName?: string,
): AdAccountSyncResult {
  return {
    platform: GOOGLE_ADS_PLATFORM,
    accountId: customerId,
    accountName: descriptiveName || `Google Ads Account ${customerId}`,
  };
}

export function mapGoogleAdsCampaignRow(
  row: Record<string, unknown>,
  accountId: string,
): AdCampaignSyncResult {
  const c = (row.campaign as Record<string, unknown>) || {};
  const m = (row.metrics as Record<string, unknown>) || {};
  const spend = Number(m.cost_micros || 0) / 1_000_000;
  const revenue = Number(m.conversions_value || 0);
  const impressions = Number(m.impressions || 0);
  const clicks = Number(m.clicks || 0);

  return {
    platform: GOOGLE_ADS_PLATFORM,
    accountId,
    campaignId: String(c.id || ''),
    campaignName: String(c.name || ''),
    status: String(c.status || 'UNKNOWN'),
    spend,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    conversions: Number(m.conversions || 0),
    impressions,
    clicks,
    ctr: Number(m.ctr || 0),
    cpc: Number(m.average_cpc || 0) / 1_000_000,
  };
}

export function mapGoogleAdsInsightRows(
  rows: Record<string, unknown>[],
  accountId: string,
): AdInsightSyncResult[] {
  const buckets = new Map<
    string,
    {
      spend: number;
      revenue: number;
      conversions: number;
      impressions: number;
      clicks: number;
    }
  >();

  for (const row of rows) {
    const metrics = (row.metrics as Record<string, unknown>) || {};
    const segments = (row.segments as Record<string, unknown>) || {};
    const dateKey = String(segments.date || '');
    if (!dateKey) {
      continue;
    }
    const bucket = buckets.get(dateKey) || {
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
    };
    bucket.spend += Number(metrics.cost_micros || 0) / 1_000_000;
    bucket.revenue += Number(metrics.conversions_value || 0);
    bucket.conversions += Number(metrics.conversions || 0);
    bucket.impressions += Number(metrics.impressions || 0);
    bucket.clicks += Number(metrics.clicks || 0);
    buckets.set(dateKey, bucket);
  }

  return Array.from(buckets.entries()).map(([dateKey, bucket]) => ({
    platform: GOOGLE_ADS_PLATFORM,
    accountId,
    date: new Date(dateKey),
    spend: bucket.spend,
    revenue: bucket.revenue,
    roas: bucket.spend > 0 ? bucket.revenue / bucket.spend : 0,
    conversions: bucket.conversions,
    impressions: bucket.impressions,
    clicks: bucket.clicks,
    ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
    cpc: bucket.clicks > 0 ? bucket.spend / bucket.clicks : 0,
  }));
}
