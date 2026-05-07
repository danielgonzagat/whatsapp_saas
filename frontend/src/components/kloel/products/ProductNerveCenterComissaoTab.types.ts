import type { JsonRecord } from './product-nerve-center.shared';

/* ── Data shapes for affiliate / coproduction records ── */
export interface AffiliateRequestRecord {
  id: string;
  affiliateName?: string;
  affiliateEmail?: string;
  createdAt?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AffiliateLinkRecord {
  id: string;
  affiliateName?: string;
  affiliateEmail?: string;
  active?: boolean;
  clicks?: number;
  sales?: number;
  code?: string;
  slug?: string;
  url?: string;
  [key: string]: unknown;
}

export interface AffiliateStatsRecord {
  requests?: number;
  pendingRequests?: number;
  activeLinks?: number;
  commission?: number;
  [key: string]: unknown;
}

/* ── Shared prop types for sub-tabs ── */
export interface SubTabProps {
  productId: string;
  p: Record<string, unknown>;
  refreshProduct: () => Promise<void>;
  setAffiliateSummary: (v: JsonRecord | null) => void;
}

export type RichTextSaveField = 'merchandContent' | 'affiliateTerms';
