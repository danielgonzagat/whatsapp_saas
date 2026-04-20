import { adminFetch } from './admin-client';

/** Admin client kyc status type. */
export type AdminClientKycStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'unknown';

/** Admin client row shape. */
export interface AdminClientRow {
  workspaceId: string;
  name: string;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string;
  kycStatus: AdminClientKycStatus;
  gmvLast30dInCents: number;
  previousGmvLast30dInCents: number;
  growthRate: number | null;
  lastSaleAt: string | null;
  productCount: number;
  plan: string | null;
  subscriptionStatus: string | null;
  customDomain: string | null;
  healthScore: number;
}

/** List clients response shape. */
export interface ListClientsResponse {
  items: AdminClientRow[];
  total: number;
}

/** List clients query shape. */
export interface ListClientsQuery {
  search?: string;
  kycStatus?: string;
  skip?: number;
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
