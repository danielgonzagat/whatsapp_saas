/* ── Shared domain types for Parcerias feature ── */

export interface Agent {
  id?: string;
  name?: string;
  email?: string;
  status?: string;
  role?: string;
  lastActive?: string;
}

export interface Invite {
  id?: string;
  email?: string;
  role?: string;
}

export interface Affiliate {
  id?: string;
  name?: string;
  email?: string;
  type?: string;
  status?: string;
  revenue?: number;
  commission?: number;
  temperature?: number;
  totalSales?: number;
  products?: string[];
  joined?: string;
  monthlyPerformance?: number[];
}

export interface AffiliatePerformance {
  totalSales?: number;
  totalRevenue?: number;
  commission?: number;
  monthlyPerformance?: number[];
}

export interface AffiliateLink {
  id: string;
  affiliateProduct?: { productId?: string };
  url?: string;
  code?: string;
  clicks?: number;
  sales?: number;
  revenue?: number;
  commission?: number;
  commissionEarned?: number;
}

export interface AffiliateSuggestion {
  id: string;
  productId?: string;
  commissionPct?: number;
  category?: string;
}

export interface PartnerContact {
  id: string;
  name?: string;
  unread?: number;
  lastMessage?: string;
  avatar?: string;
  type?: string;
  online?: boolean;
  time?: string;
}

export interface PartnerMessage {
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: string;
  content?: string;
  time?: string;
  isMe?: boolean;
}

export interface AffiliateLinksTotals {
  clicks: number;
  sales: number;
  revenue: number;
  commission: number;
}
