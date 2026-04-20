import { adminFetch } from './admin-client';

/** Admin account kyc status type. */
export type AdminAccountKycStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'unknown';

/** Admin account row shape. */
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
  suspended: boolean;
  blocked: boolean;
  frozenBalanceInCents: number;
}

/** List accounts response shape. */
export interface ListAccountsResponse {
  items: AdminAccountRow[];
  total: number;
}

/** Admin account agent shape. */
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

/** Admin account kyc document shape. */
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

/** Admin account detail shape. */
export interface AdminAccountDetail {
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ownerAgentId: string | null;
  ownerEmail: string | null;
  lifecycle: {
    suspended: boolean;
    blocked: boolean;
    frozenBalanceInCents: number;
    reason: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
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

/** Admin account impersonation session shape. */
export interface AdminAccountImpersonationSession {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    name: string;
    email: string;
    workspaceId: string;
    role: string;
  };
  workspace: {
    id: string;
    name: string;
  } | null;
  workspaces: Array<{
    id: string;
    name: string;
  }>;
}

/** Kyc queue row shape. */
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

/** Kyc queue response shape. */
export interface KycQueueResponse {
  items: KycQueueRow[];
  total: number;
}

/** List accounts query shape. */
export interface ListAccountsQuery {
  search?: string;
  kycStatus?: string;
  skip?: number;
  take?: number;
}

/** Admin account state action type. */
export type AdminAccountStateAction = 'SUSPEND' | 'BLOCK' | 'UNBLOCK' | 'FREEZE' | 'UNFREEZE';

/** Admin accounts api. */
export const adminAccountsApi = {
  list(query: ListAccountsQuery = {}): Promise<ListAccountsResponse> {
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
  updateState(
    workspaceId: string,
    body: { action: AdminAccountStateAction; reason?: string; frozenBalanceInCents?: number },
  ): Promise<void> {
    return adminFetch<void>(`/accounts/${encodeURIComponent(workspaceId)}/state`, {
      method: 'POST',
      body,
    });
  },
  bulkUpdateState(body: {
    workspaceIds: string[];
    action: AdminAccountStateAction;
    reason?: string;
    frozenBalanceInCents?: number;
  }): Promise<{ updated: number }> {
    return adminFetch<{ updated: number }>(`/accounts/bulk/state`, {
      method: 'POST',
      body,
    });
  },
  resetOwnerPassword(
    workspaceId: string,
    temporaryPassword?: string,
  ): Promise<{ ownerAgentId: string; ownerEmail: string; temporaryPassword: string }> {
    return adminFetch<{ ownerAgentId: string; ownerEmail: string; temporaryPassword: string }>(
      `/accounts/${encodeURIComponent(workspaceId)}/reset-password`,
      {
        method: 'POST',
        body: { temporaryPassword },
      },
    );
  },
  impersonateOwner(workspaceId: string): Promise<AdminAccountImpersonationSession> {
    return adminFetch<AdminAccountImpersonationSession>(
      `/accounts/${encodeURIComponent(workspaceId)}/impersonate`,
      {
        method: 'POST',
      },
    );
  },
};
