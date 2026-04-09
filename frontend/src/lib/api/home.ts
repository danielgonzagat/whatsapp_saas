import { apiFetch, buildQuery } from './core';

export type DashboardHomePeriod = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DashboardHomeProduct {
  id: string;
  name: string;
  status: string;
  category: string | null;
  imageUrl: string | null;
  totalRevenueInCents: number;
  totalSales: number;
  isTop: boolean;
}

export interface DashboardHomeConversation {
  id: string;
  contactName: string;
  contactPhone: string | null;
  avatarUrl: string | null;
  preview: string;
  lastMessageAt: string | null;
  status: 'ai' | 'waiting' | 'done';
  unreadCount: number;
}

export interface DashboardHomeCheckpoint {
  id: string;
  label: string;
  description: string;
  active: boolean;
}

export interface DashboardHomeResponse {
  generatedAt: string;
  range: {
    period: DashboardHomePeriod;
    label: string;
    startDate: string;
    endDate: string;
  };
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
  series: {
    labels: string[];
    revenueInCents: number[];
    previousRevenueInCents: number[];
    paidOrders: number[];
    totalOrders: number[];
    conversionRatePct: number[];
    averageTicketInCents: number[];
  };
  products: DashboardHomeProduct[];
  recentConversations: DashboardHomeConversation[];
  health: {
    operationalScorePct: number;
    checkoutCompletionRatePct: number;
    activeCheckpoints: number;
    totalCheckpoints: number;
    checkpoints: DashboardHomeCheckpoint[];
  };
}

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
