import { adminFetch } from './admin-client';

export type AdminAccountKycStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'unknown';

export interface AdminAccountRow {
  workspaceId: string;
  name: string;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string;
  kycStatus: AdminAccountKycStatus;
  gmvLast30dInCents: number;
  lastSaleAt: string | null;
  productCount: number;
}

export interface ListAccountsResponse {
  items: AdminAccountRow[];
  total: number;
}

export interface AdminAccountAgent {
  id: string;
  name: string;
  email: string;
  role: string;
  kycStatus: string;
  kycSubmittedAt: string | null;
  kycApprovedAt: string | null;
  kycRejectedReason: string | null;
}

export interface AdminAccountKycDocument {
  id: string;
  type: string;
  fileUrl: string;
  fileName: string;
  status: string;
  rejectedReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminAccountDetail {
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  agents: AdminAccountAgent[];
  kycDocuments: AdminAccountKycDocument[];
  productCount: number;
  gmvLast30dInCents: number;
  gmvAllTimeInCents: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalInCents: number;
    customerEmail: string;
    createdAt: string;
    paidAt: string | null;
  }>;
}

export interface KycQueueRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  workspaceId: string;
  workspaceName: string;
  kycStatus: string;
  kycSubmittedAt: string | null;
  documentCount: number;
}

export interface KycQueueResponse {
  items: KycQueueRow[];
  total: number;
}

export interface ListAccountsQuery {
  search?: string;
  kycStatus?: string;
  skip?: number;
  take?: number;
}

export const adminAccountsApi = {
  list(query: ListAccountsQuery = {}): Promise<ListAccountsResponse> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.kycStatus) params.set('kycStatus', query.kycStatus);
    if (query.skip !== undefined) params.set('skip', String(query.skip));
    if (query.take !== undefined) params.set('take', String(query.take));
    const qs = params.toString();
    return adminFetch<ListAccountsResponse>(qs ? `/accounts?${qs}` : '/accounts');
  },
  detail(workspaceId: string): Promise<AdminAccountDetail> {
    return adminFetch<AdminAccountDetail>(`/accounts/${encodeURIComponent(workspaceId)}`);
  },
  kycQueue(): Promise<KycQueueResponse> {
    return adminFetch<KycQueueResponse>('/accounts/kyc/queue');
  },
  approveKyc(agentId: string, note?: string): Promise<void> {
    return adminFetch<void>(`/accounts/agents/${encodeURIComponent(agentId)}/kyc/approve`, {
      method: 'POST',
      body: { note },
    });
  },
  rejectKyc(agentId: string, reason: string): Promise<void> {
    return adminFetch<void>(`/accounts/agents/${encodeURIComponent(agentId)}/kyc/reject`, {
      method: 'POST',
      body: { reason },
    });
  },
  reverifyKyc(agentId: string, reason: string): Promise<void> {
    return adminFetch<void>(`/accounts/agents/${encodeURIComponent(agentId)}/kyc/reverify`, {
      method: 'POST',
      body: { reason },
    });
  },
};
