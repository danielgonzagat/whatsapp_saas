import { adminFetch } from './admin-client';

/** Admin account kyc status type. */
export type AdminAccountKycStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'unknown';

/** Admin account row shape. */
export interface AdminAccountRow {
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
  kycStatus: AdminAccountKycStatus;
  /** Gmv last30d in cents property. */
  gmvLast30dInCents: number;
  /** Last sale at property. */
  lastSaleAt: string | null;
  /** Product count property. */
  productCount: number;
  /** Suspended property. */
  suspended: boolean;
  /** Blocked property. */
  blocked: boolean;
  /** Frozen balance in cents property. */
  frozenBalanceInCents: number;
}

/** List accounts response shape. */
export interface ListAccountsResponse {
  /** Items property. */
  items: AdminAccountRow[];
  /** Total property. */
  total: number;
}

/** Admin account agent shape. */
export interface AdminAccountAgent {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Email property. */
  email: string;
  /** Role property. */
  role: string;
  /** Kyc status property. */
  kycStatus: string;
  /** Kyc submitted at property. */
  kycSubmittedAt: string | null;
  /** Kyc approved at property. */
  kycApprovedAt: string | null;
  /** Kyc rejected reason property. */
  kycRejectedReason: string | null;
}

/** Admin account kyc document shape. */
export interface AdminAccountKycDocument {
  /** Id property. */
  id: string;
  /** Type property. */
  type: string;
  /** File url property. */
  fileUrl: string;
  /** File name property. */
  fileName: string;
  /** Status property. */
  status: string;
  /** Rejected reason property. */
  rejectedReason: string | null;
  /** Reviewed at property. */
  reviewedAt: string | null;
  /** Created at property. */
  createdAt: string;
}

/** Admin account detail shape. */
export interface AdminAccountDetail {
  /** Workspace id property. */
  workspaceId: string;
  /** Name property. */
  name: string;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Owner agent id property. */
  ownerAgentId: string | null;
  /** Owner email property. */
  ownerEmail: string | null;
  /** Lifecycle property. */
  lifecycle: {
    suspended: boolean;
    blocked: boolean;
    frozenBalanceInCents: number;
    reason: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  /** Agents property. */
  agents: AdminAccountAgent[];
  /** Kyc documents property. */
  kycDocuments: AdminAccountKycDocument[];
  /** Product count property. */
  productCount: number;
  /** Gmv last30d in cents property. */
  gmvLast30dInCents: number;
  /** Gmv all time in cents property. */
  gmvAllTimeInCents: number;
  /** Recent orders property. */
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
  /** Access_token property. */
  access_token: string;
  /** Refresh_token property. */
  refresh_token: string;
  /** User property. */
  user: {
    id: string;
    name: string;
    email: string;
    workspaceId: string;
    role: string;
  };
  /** Workspace property. */
  workspace: {
    id: string;
    name: string;
  } | null;
  /** Workspaces property. */
  workspaces: Array<{
    id: string;
    name: string;
  }>;
}

/** Kyc queue row shape. */
export interface KycQueueRow {
  /** Agent id property. */
  agentId: string;
  /** Agent name property. */
  agentName: string;
  /** Agent email property. */
  agentEmail: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName: string;
  /** Kyc status property. */
  kycStatus: string;
  /** Kyc submitted at property. */
  kycSubmittedAt: string | null;
  /** Document count property. */
  documentCount: number;
}

/** Kyc queue response shape. */
export interface KycQueueResponse {
  /** Items property. */
  items: KycQueueRow[];
  /** Total property. */
  total: number;
}

/** List accounts query shape. */
export interface ListAccountsQuery {
  /** Search property. */
  search?: string;
  /** Kyc status property. */
  kycStatus?: string;
  /** Skip property. */
  skip?: number;
  /** Take property. */
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
