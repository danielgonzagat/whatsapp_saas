/** Marketing skill catalog entry shape. */
export interface MarketingSkillCatalogEntry {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Keywords property. */
  keywords: string[];
  /** Brazil notes property. */
  brazilNotes: string[];
}

/** Marketing skill route hit shape. */
export interface MarketingSkillRouteHit {
  /** Id property. */
  id: string;
  /** Score property. */
  score: number;
  /** Reasons property. */
  reasons: string[];
}

/** Marketing skill selection shape. */
export interface MarketingSkillSelection extends MarketingSkillRouteHit {
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Excerpt property. */
  excerpt: string;
}

/** Marketing workspace snapshot shape. */
export interface MarketingWorkspaceSnapshot {
  /** Workspace name property. */
  workspaceName: string | null;
  /** Brand voice property. */
  brandVoice: string | null;
  /** Product count property. */
  productCount: number;
  /** Active product count property. */
  activeProductCount: number;
  /** Top products property. */
  topProducts: Array<{
    id: string;
    name: string;
    price: number | null;
    active: boolean;
  }>;
  /** Paid order count property. */
  paidOrderCount: number;
  /** Total order count property. */
  totalOrderCount: number;
  /** Social lead count property. */
  socialLeadCount: number;
  /** Checkout conversion rate property. */
  checkoutConversionRate: number | null;
  /** Gross revenue cents property. */
  grossRevenueCents: number;
  /** Campaign count property. */
  campaignCount: number;
  /** Recent campaigns property. */
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    scheduledAt: string | null;
  }>;
  /** Site count property. */
  siteCount: number;
  /** Published site count property. */
  publishedSiteCount: number;
  /** Affiliate product count property. */
  affiliateProductCount: number;
  /** Affiliate link count property. */
  affiliateLinkCount: number;
  /** Contact count property. */
  contactCount: number;
  /** Notes property. */
  notes: string[];
}

/** Marketing skill packet shape. */
export interface MarketingSkillPacket {
  /** Is marketing request property. */
  isMarketingRequest: boolean;
  /** Selected skills property. */
  selectedSkills: MarketingSkillSelection[];
  /** Snapshot property. */
  snapshot: MarketingWorkspaceSnapshot;
  /** Prompt addendum property. */
  promptAddendum: string;
}
