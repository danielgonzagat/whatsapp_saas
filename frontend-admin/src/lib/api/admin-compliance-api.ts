import { adminFetch } from './admin-client';
import type { AdminHomePeriod } from './admin-dashboard-api';
import type { AdminTransactionRow } from './admin-transactions-api';

/** Admin compliance overview response shape. */
export interface AdminComplianceOverviewResponse {
  /** Range property. */
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
  };
  /** Summary property. */
  summary: {
    chargebackCount: number;
    chargebackAmountInCents: number;
    refundCount: number;
    refundAmountInCents: number;
    kycEventsCount: number;
  };
  /** Chargebacks property. */
  chargebacks: AdminTransactionRow[];
  /** Refunds property. */
  refunds: AdminTransactionRow[];
  /** Risk by gateway property. */
  riskByGateway: Array<{
    gateway: string;
    count: number;
    totalInCents: number;
  }>;
  /** Risk by workspace property. */
  riskByWorkspace: Array<{
    workspaceId: string;
    workspaceName: string | null;
    chargebackCount: number;
    refundCount: number;
    totalInCents: number;
  }>;
  /** Kyc queue property. */
  kycQueue: Array<{
    agentId: string;
    workspaceId: string;
    workspaceName: string;
    ownerName: string;
    ownerEmail: string;
    kycStatus: string;
  }>;
  /** Recent kyc events property. */
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
