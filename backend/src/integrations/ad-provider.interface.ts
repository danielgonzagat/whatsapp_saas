export interface AdAccountSyncResult {
  platform: string;
  accountId: string;
  accountName?: string;
}

export interface AdCampaignSyncResult {
  platform: string;
  accountId: string;
  campaignId: string;
  campaignName?: string;
  status?: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

export interface AdInsightSyncResult {
  platform: string;
  accountId: string;
  date: Date;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

export interface OAuthConnectResult {
  connected: boolean;
  status: string;
  authUrl?: string;
  providerMessage?: string;
}

export interface OAuthStatusResult {
  connected: boolean;
  status: string;
  accountId?: string;
  accountName?: string;
}

export interface SyncAccountsResult {
  accounts: AdAccountSyncResult[];
}

export interface SyncCampaignsResult {
  campaigns: AdCampaignSyncResult[];
}

export interface SyncInsightsResult {
  insights: AdInsightSyncResult[];
}

export interface AdProvider {
  readonly platform: string;
  connect(workspaceId: string, redirectUri: string): Promise<OAuthConnectResult>;
  completeOAuth(workspaceId: string, code: string, redirectUri: string): Promise<OAuthConnectResult>;
  getStatus(workspaceId: string): Promise<OAuthStatusResult>;
  syncAccounts(workspaceId: string): Promise<SyncAccountsResult>;
  syncCampaigns(workspaceId: string): Promise<SyncCampaignsResult>;
  syncInsights(workspaceId: string, since: Date, until: Date): Promise<SyncInsightsResult>;
}
