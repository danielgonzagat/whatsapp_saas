export type PlatformKey = 'meta' | 'google' | 'tiktok';

export interface PlatformData {
  name: string;
  color: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  connected: boolean;
}

export interface Campaign {
  id: string;
  platform: PlatformKey;
  name: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
  conv: number;
  ctr: number;
  cpc: number;
  trend: 'up' | 'down';
}

export interface AdRule {
  id: string;
  condition: string;
  action: string;
  active: boolean;
  fires: number;
}

export type TabId = 'visao' | 'meta' | 'google' | 'tiktok' | 'track' | 'rules';

export const PLATFORM_DEFAULTS: Record<PlatformKey, PlatformData> = {
  meta: {
    name: 'Meta Ads', color: '#1877F2', spend: 0, revenue: 0, roas: 0,
    conversions: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, connected: false,
  },
  google: {
    name: 'Google Ads', color: '#4285F4', spend: 0, revenue: 0, roas: 0,
    conversions: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, connected: false,
  },
  tiktok: {
    name: 'TikTok Ads', color: '#FF0050', spend: 0, revenue: 0, roas: 0,
    conversions: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, connected: false,
  },
};

export interface KeywordEntry {
  keyword: string;
  conv: number;
  cpc: number;
}
