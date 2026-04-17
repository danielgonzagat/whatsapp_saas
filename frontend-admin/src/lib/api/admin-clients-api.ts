import { adminFetch } from './admin-client';

export type AdminClientKycStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'unknown';

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

export interface ListClientsResponse {
  items: AdminClientRow[];
  total: number;
}

export interface ListClientsQuery {
  search?: string;
  kycStatus?: string;
  skip?: number;
  take?: number;
}

export const adminClientsApi = {
  list(query: ListClientsQuery = {}): Promise<ListClientsResponse> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.kycStatus) params.set('kycStatus', query.kycStatus);
    if (query.skip !== undefined) params.set('skip', String(query.skip));
    if (query.take !== undefined) params.set('take', String(query.take));
    const qs = params.toString();
    return adminFetch<ListClientsResponse>(qs ? `/clients?${qs}` : '/clients');
  },
};
