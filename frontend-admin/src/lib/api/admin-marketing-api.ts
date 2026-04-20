import { adminFetch } from './admin-client';
import type { AdminHomePeriod } from './admin-dashboard-api';

/** Admin marketing overview response shape. */
export interface AdminMarketingOverviewResponse {
  /** Range property. */
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
  };
  /** Hero property. */
  hero: {
    revenueKloelInCents: number;
    messages: number;
    leads: number;
    approvedOrders: number;
  };
  /** Channels property. */
  channels: Array<{
    key: string;
    label: string;
    status: string;
    conversations: number;
    messages: number;
  }>;
  /** Top products property. */
  topProducts: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    workspaceId: string;
    workspaceName: string | null;
    gmvInCents: number;
    approvedOrders: number;
  }>;
  /** Ai property. */
  ai: {
    activeConversations: number;
    trackedProducts: number;
    approvedOrders: number;
  };
  /** Rankings property. */
  rankings: Array<{
    label: string;
    value: number;
    detail: string;
  }>;
  /** Feed property. */
  feed: Array<{
    id: string;
    title: string;
    body: string;
    meta: string;
  }>;
}

/** Admin marketing api. */
export const adminMarketingApi = {
  overview(query: { period?: AdminHomePeriod; from?: string; to?: string } = {}) {
    const params = new URLSearchParams();
    params.set('period', query.period ?? '30D');
    if (query.from) {
      params.set('from', query.from);
    }
    if (query.to) {
      params.set('to', query.to);
    }
    return adminFetch<AdminMarketingOverviewResponse>(`/marketing/overview?${params.toString()}`);
  },
};
