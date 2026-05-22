export interface ContactCustomFields {
  buyerStatus?: string;
  catalogedAt?: string | null;
  category?: string;
  checkoutOrigin?: string;
  checkoutSocialLead?: boolean;
  city?: string;
  cluster?: string;
  demographics?: ContactDemographics;
  fullSummary?: string | null;
  importantDetails?: string[];
  intent?: string | null;
  lastCampaignId?: string | null;
  lastCatalogChatId?: string | null;
  lastNeuroCrmAnalysisAt?: string | null;
  lastRemoteChatId?: string | null;
  lastResolvedChatId?: string | null;
  lastScoredAt?: string | null;
  nameResolutionStatus?: string;
  notPurchasedReason?: string | null;
  optin?: boolean;
  optin_whatsapp?: boolean;
  placeholderRelationCount?: number;
  placeholderSanitizedAt?: string;
  preferences?: string[];
  probabilityReasons?: string[];
  purchasedProduct?: string | null;
  purchaseProbabilityPercent?: number;
  purchaseProbabilityScore?: number;
  purchaseReason?: string | null;
  purchaseValue?: number | null;
  remotePushName?: string | null;
  remotePushNameUpdatedAt?: string | null;
  source?: string;
  state?: string;
  whatsappSavedAt?: string | null;
  autopilotNextRetryAt?: string | null;
  address?: string;

  [key: string]: unknown;
}

interface ContactDemographics {
  gender?: string;
  ageRange?: string;
  location?: string;
  confidence?: number;
  [key: string]: unknown;
}
