export interface MarketingSkillCatalogEntry {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  brazilNotes: string[];
}

export interface MarketingSkillRouteHit {
  id: string;
  score: number;
  reasons: string[];
}

export interface MarketingSkillSelection extends MarketingSkillRouteHit {
  title: string;
  summary: string;
  excerpt: string;
}

export interface MarketingWorkspaceSnapshot {
  workspaceName: string | null;
  brandVoice: string | null;
  productCount: number;
  activeProductCount: number;
  topProducts: Array<{
    id: string;
    name: string;
    price: number | null;
    active: boolean;
  }>;
  paidOrderCount: number;
  totalOrderCount: number;
  socialLeadCount: number;
  checkoutConversionRate: number | null;
  grossRevenueCents: number;
  campaignCount: number;
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    scheduledAt: string | null;
  }>;
  siteCount: number;
  publishedSiteCount: number;
  affiliateProductCount: number;
  affiliateLinkCount: number;
  contactCount: number;
  notes: string[];
}

export interface MarketingSkillPacket {
  isMarketingRequest: boolean;
  selectedSkills: MarketingSkillSelection[];
  snapshot: MarketingWorkspaceSnapshot;
  promptAddendum: string;
}
