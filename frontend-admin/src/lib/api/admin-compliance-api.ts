import { adminFetch } from './admin-client';
import type { AdminHomePeriod } from './admin-dashboard-api';
import type { AdminTransactionRow } from './admin-transactions-api';

/** Admin compliance overview response shape. */
export interface AdminComplianceOverviewResponse {
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
  };
  summary: {
    chargebackCount: number;
    chargebackAmountInCents: number;
    refundCount: number;
    refundAmountInCents: number;
    kycEventsCount: number;
  };
  chargebacks: AdminTransactionRow[];
  refunds: AdminTransactionRow[];
  riskByGateway: Array<{
    gateway: string;
    count: number;
    totalInCents: number;
  }>;
  riskByWorkspace: Array<{
    workspaceId: string;
    workspaceName: string | null;
    chargebackCount: number;
    refundCount: number;
    totalInCents: number;
  }>;
  kycQueue: Array<{
    agentId: string;
    workspaceId: string;
    workspaceName: string;
    ownerName: string;
    ownerEmail: string;
    kycStatus: string;
  }>;
  recentKycEvents: Array<{
    id: string;
    action: string;
    entityId: string | null;
    actorName: string | null;
    details: unknown;
    createdAt: string;
  }>;
}

/** Admin compliance api. */
export const adminComplianceApi = {
  overview(query: { period?: AdminHomePeriod; from?: string; to?: string } = {}) {
    const params = new URLSearchParams();
    params.set('period', query.period ?? '30D');
    if (query.from) {
      params.set('from', query.from);
    }
    if (query.to) {
      params.set('to', query.to);
    }
    return adminFetch<AdminComplianceOverviewResponse>(`/compliance/overview?${params.toString()}`);
  },
};
