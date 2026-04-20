import { apiFetch, buildQuery } from './core';

/** Dashboard home period type. */
export type DashboardHomePeriod = 'today' | '30d' | 'custom';

/** Dashboard home product shape. */
export interface DashboardHomeProduct {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Status property. */
  status: string;
  /** Category property. */
  category: string | null;
  /** Image url property. */
  imageUrl: string | null;
  /** Total revenue in cents property. */
  totalRevenueInCents: number;
  /** Total sales property. */
  totalSales: number;
  /** Is top property. */
  isTop: boolean;
}

/** Dashboard home conversation shape. */
export interface DashboardHomeConversation {
  /** Id property. */
  id: string;
  /** Contact name property. */
  contactName: string;
  /** Contact phone property. */
  contactPhone: string | null;
  /** Avatar url property. */
  avatarUrl: string | null;
  /** Preview property. */
  preview: string;
  /** Last message at property. */
  lastMessageAt: string | null;
  /** Status property. */
  status: 'ai' | 'waiting' | 'done';
  /** Unread count property. */
  unreadCount: number;
}

/** Dashboard home checkpoint shape. */
export interface DashboardHomeCheckpoint {
  /** Id property. */
  id: string;
  /** Label property. */
  label: string;
  /** Description property. */
  description: string;
  /** Active property. */
  active: boolean;
}

/** Dashboard home response shape. */
export interface DashboardHomeResponse {
  /** Generated at property. */
  generatedAt: string;
  /** Range property. */
  range: {
    period: DashboardHomePeriod;
    label: string;
    startDate: string;
    endDate: string;
  };
  /** Hero property. */
  hero: {
    totalRevenueInCents: number;
    previousRevenueInCents: number;
    revenueDeltaPct: number | null;
    monthRevenueInCents: number;
    previousMonthRevenueInCents: number;
    todayRevenueInCents: number;
    yesterdayRevenueInCents: number;
    availableBalanceInCents: number;
    pendingBalanceInCents: number;
  };
  /** Metrics property. */
  metrics: {
    paidOrders: number;
    totalOrders: number;
    conversionRatePct: number;
    averageTicketInCents: number;
    totalConversations: number;
    convertedOrders: number;
    waitingForHuman: number;
    averageResponseTimeSeconds: number;
  };
  /** Series property. */
  series: {
    labels: string[];
    revenueInCents: number[];
    previousRevenueInCents: number[];
    paidOrders: number[];
    totalOrders: number[];
    conversionRatePct: number[];
    averageTicketInCents: number[];
  };
  /** Products property. */
  products: DashboardHomeProduct[];
  /** Recent conversations property. */
  recentConversations: DashboardHomeConversation[];
  /** Health property. */
  health: {
    operationalScorePct: number;
    checkoutCompletionRatePct: number;
    activeCheckpoints: number;
    totalCheckpoints: number;
    checkpoints: DashboardHomeCheckpoint[];
  };
}

/** Get dashboard home. */
export async function getDashboardHome(params?: {
  period?: DashboardHomePeriod;
  startDate?: string;
  endDate?: string;
}) {
  const query = buildQuery({
    period: params?.period,
    startDate: params?.startDate,
    endDate: params?.endDate,
  });
  const response = await apiFetch<DashboardHomeResponse>(`/dashboard/home${query}`);
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data as DashboardHomeResponse;
}
