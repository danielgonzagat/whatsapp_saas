import { adminFetch } from './admin-client';
import type { AdminHomePeriod } from './admin-dashboard-api';

export interface AdminMarketingOverviewResponse {
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
  };
  hero: {
    revenueKloelInCents: number;
    messages: number;
    leads: number;
    approvedOrders: number;
  };
  channels: Array<{
    key: string;
    label: string;
    status: string;
    conversations: number;
    messages: number;
  }>;
  topProducts: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    workspaceId: string;
    workspaceName: string | null;
    gmvInCents: number;
    approvedOrders: number;
  }>;
  ai: {
    activeConversations: number;
    trackedProducts: number;
    approvedOrders: number;
  };
  rankings: Array<{
    label: string;
    value: number;
    detail: string;
  }>;
  feed: Array<{
    id: string;
    title: string;
    body: string;
    meta: string;
  }>;
}

export const adminMarketingApi = {
  overview(query: { period?: AdminHomePeriod; from?: string; to?: string } = {}) {
    const params = new URLSearchParams();
    params.set('period', query.period ?? '30D');
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return adminFetch<AdminMarketingOverviewResponse>(`/marketing/overview?${params.toString()}`);
  },
};
