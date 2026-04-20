import { adminFetch } from './admin-client';

/** Admin client kyc status type. */
export type AdminClientKycStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'unknown';

/** Admin client row shape. */
export interface AdminClientRow {
  /** Workspace id property. */
  workspaceId: string;
  /** Name property. */
  name: string;
  /** Owner email property. */
  ownerEmail: string | null;
  /** Owner name property. */
  ownerName: string | null;
  /** Created at property. */
  createdAt: string;
  /** Kyc status property. */
  kycStatus: AdminClientKycStatus;
  /** Gmv last30d in cents property. */
  gmvLast30dInCents: number;
  /** Previous gmv last30d in cents property. */
  previousGmvLast30dInCents: number;
  /** Growth rate property. */
  growthRate: number | null;
  /** Last sale at property. */
  lastSaleAt: string | null;
  /** Product count property. */
  productCount: number;
  /** Plan property. */
  plan: string | null;
  /** Subscription status property. */
  subscriptionStatus: string | null;
  /** Custom domain property. */
  customDomain: string | null;
  /** Health score property. */
  healthScore: number;
}

/** List clients response shape. */
export interface ListClientsResponse {
  /** Items property. */
  items: AdminClientRow[];
  /** Total property. */
  total: number;
}

/** List clients query shape. */
export interface ListClientsQuery {
  /** Search property. */
  search?: string;
  /** Kyc status property. */
  kycStatus?: string;
  /** Skip property. */
  skip?: number;
  /** Take property. */
  take?: number;
}

/** Admin clients api. */
export const adminClientsApi = {
  list(query: ListClientsQuery = {}): Promise<ListClientsResponse> {
    const params = new URLSearchParams();
    if (query.search) {
      params.set('search', query.search);
    }
    if (query.kycStatus) {
      params.set('kycStatus', query.kycStatus);
    }
    if (query.skip !== undefined) {
      params.set('skip', String(query.skip));
    }
    if (query.take !== undefined) {
      params.set('take', String(query.take));
    }
    const qs = params.toString();
    return adminFetch<ListClientsResponse>(qs ? `/clients?${qs}` : '/clients');
  },
};
