import { adminFetch } from './admin-client';

/** Marketplace treasury balance shape. */
export interface MarketplaceTreasuryBalance {
  /** Currency property. */
  currency: string;
  /** Available in cents property. */
  availableInCents: number;
  /** Pending in cents property. */
  pendingInCents: number;
  /** Reserved in cents property. */
  reservedInCents: number;
  /** Updated at property. */
  updatedAt: string;
}

/** Marketplace treasury ledger kind type. */
export type MarketplaceTreasuryLedgerKind =
  | 'MARKETPLACE_FEE_CREDIT'
  | 'CHARGEBACK_RESERVE'
  | 'REFUND_DEBIT'
  | 'CHARGEBACK_DEBIT'
  | 'PAYOUT_DEBIT'
  | 'ADJUSTMENT_CREDIT'
  | 'ADJUSTMENT_DEBIT'
  | 'RESERVE_RELEASE';

/** Marketplace treasury ledger row shape. */
export interface MarketplaceTreasuryLedgerRow {
  /** Id property. */
  id: string;
  /** Currency property. */
  currency: string;
  /** Direction property. */
  direction: 'credit' | 'debit';
  /** Bucket property. */
  bucket: 'AVAILABLE' | 'PENDING' | 'RESERVED';
  /** Amount in cents property. */
  amountInCents: number;
  /** Kind property. */
  kind: MarketplaceTreasuryLedgerKind;
  /** Order id property. */
  orderId: string | null;
  /** Reason property. */
  reason: string;
  /** Created at property. */
  createdAt: string;
}

/** List ledger response shape. */
export interface ListLedgerResponse {
  /** Items property. */
  items: MarketplaceTreasuryLedgerRow[];
  /** Total property. */
  total: number;
}

/** Marketplace treasury reconcile report shape. */
export interface MarketplaceTreasuryReconcileReport {
  /** Currency property. */
  currency: string;
  /** Run at property. */
  runAt: string;
  /** Ledger available in cents property. */
  ledgerAvailableInCents: number;
  /** Ledger pending in cents property. */
  ledgerPendingInCents: number;
  /** Ledger reserved in cents property. */
  ledgerReservedInCents: number;
  /** Wallet available in cents property. */
  walletAvailableInCents: number;
  /** Wallet pending in cents property. */
  walletPendingInCents: number;
  /** Wallet reserved in cents property. */
  walletReservedInCents: number;
  /** Available drift in cents property. */
  availableDriftInCents: number;
  /** Pending drift in cents property. */
  pendingDriftInCents: number;
  /** Reserved drift in cents property. */
  reservedDriftInCents: number;
  /** Healthy property. */
  healthy: boolean;
}

/** List ledger query shape. */
export interface ListLedgerQuery {
  /** Currency property. */
  currency?: string;
  /** Kind property. */
  kind?: MarketplaceTreasuryLedgerKind;
  /** From property. */
  from?: string;
  /** To property. */
  to?: string;
  /** Skip property. */
  skip?: number;
  /** Take property. */
  take?: number;
}

export interface ConnectAccountRow {
  accountBalanceId: string;
  workspaceId: string;
  stripeAccountId: string;
  accountType: string;
  pendingCents: string;
  availableCents: string;
  lifetimeReceivedCents: string;
  lifetimePaidOutCents: string;
  lifetimeChargebacksCents: string;
  onboarding: unknown;
}

export interface ListConnectAccountsResponse {
  accounts: ConnectAccountRow[];
}

export interface ConnectReconcileDrift {
  accountBalanceId: string;
  workspaceId: string;
  stripeAccountId: string;
  ledgerAvailableCents: string;
  walletAvailableCents: string;
  driftInCents: string;
}

export interface ConnectReconcileReport {
  scannedAccounts: number;
  drifts: ConnectReconcileDrift[];
  scannedAt: string;
}

export interface PayoutRow {
  id: string;
  action: string;
  createdAt: string;
  requestId: string | null;
  payoutId: string | null;
  status: string | null;
  amountCents: string | null;
  currency: string | null;
  error: string | null;
  adminUser: unknown;
}

export interface ListPayoutsResponse {
  items: PayoutRow[];
  total: number;
}

export interface CreatePayoutBody {
  amountCents: number;
  requestId?: string;
  currency?: string;
}

export interface CreatePayoutResponse {
  success: boolean;
  payoutId: string;
  status: string;
  amountCents: string;
  currency: string;
}

export type ConnectPayoutRequestState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ConnectPayoutRequestRow {
  approvalRequestId: string;
  workspaceId: string;
  accountBalanceId: string;
  accountType: string;
  stripeAccountId: string;
  amountCents: string;
  currency: string;
  requestId: string;
  state: ConnectPayoutRequestState;
  title: string;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  decision: string | null;
}

export interface ListConnectPayoutRequestsResponse {
  items: ConnectPayoutRequestRow[];
  total: number;
}

export interface ListConnectPayoutRequestsQuery {
  workspaceId?: string;
  state?: ConnectPayoutRequestState;
  skip?: number;
  take?: number;
}

export interface ApproveRejectResponse {
  success: boolean;
  approvalRequestId: string;
  state: string;
  payoutId?: string;
  status?: string;
  accountBalanceId?: string;
  stripeAccountId?: string;
  amountCents?: string;
  currency?: string;
}

export interface FraudBlacklistRow {
  id: string;
  type: string;
  value: string;
  reason: string;
  addedBy: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface ListFraudBlacklistResponse {
  items: FraudBlacklistRow[];
  total: number;
}

export interface ListFraudBlacklistQuery {
  type?: string;
  value?: string;
  skip?: number;
  take?: number;
}

export interface AddFraudBlacklistBody {
  type: string;
  value: string;
  reason: string;
  expiresAt?: string;
}

export interface RemoveFraudBlacklistBody {
  type: string;
  value: string;
}

export interface RemoveFraudBlacklistResponse {
  removedCount: number;
}

function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

/** Admin carteira api. */
export const adminCarteiraApi = {
  balance(currency = 'BRL'): Promise<MarketplaceTreasuryBalance> {
    return adminFetch<MarketplaceTreasuryBalance>(
      `/carteira/balance?currency=${encodeURIComponent(currency)}`,
    );
  },
  ledger(query: ListLedgerQuery = {}): Promise<ListLedgerResponse> {
    const queryString = qs(query as Record<string, unknown>);
    return adminFetch<ListLedgerResponse>(
      queryString ? `/carteira/ledger?${queryString}` : '/carteira/ledger',
    );
  },
  reconcile(currency = 'BRL'): Promise<MarketplaceTreasuryReconcileReport> {
    return adminFetch<MarketplaceTreasuryReconcileReport>(
      `/carteira/reconcile?currency=${encodeURIComponent(currency)}`,
    );
  },

  connectAccounts(query?: { workspaceId?: string }): Promise<ListConnectAccountsResponse> {
    const queryString = qs((query || {}) as Record<string, unknown>);
    return adminFetch<ListConnectAccountsResponse>(
      queryString ? `/carteira/connect/accounts?${queryString}` : '/carteira/connect/accounts',
    );
  },

  connectReconcile(query?: { workspaceId?: string }): Promise<ConnectReconcileReport> {
    const queryString = qs((query || {}) as Record<string, unknown>);
    return adminFetch<ConnectReconcileReport>(
      queryString
        ? `/carteira/connect/reconcile?${queryString}`
        : '/carteira/connect/reconcile',
    );
  },

  listPayouts(query?: { skip?: number; take?: number }): Promise<ListPayoutsResponse> {
    const queryString = qs((query || {}) as Record<string, unknown>);
    return adminFetch<ListPayoutsResponse>(
      queryString ? `/carteira/payouts?${queryString}` : '/carteira/payouts',
    );
  },

  createPayout(body: CreatePayoutBody): Promise<CreatePayoutResponse> {
    return adminFetch<CreatePayoutResponse, CreatePayoutBody>('/carteira/payouts', {
      method: 'POST',
      body,
    });
  },

  listConnectPayoutRequests(
    query?: ListConnectPayoutRequestsQuery,
  ): Promise<ListConnectPayoutRequestsResponse> {
    const queryString = qs((query || {}) as Record<string, unknown>);
    return adminFetch<ListConnectPayoutRequestsResponse>(
      queryString
        ? `/carteira/connect/payout-requests?${queryString}`
        : '/carteira/connect/payout-requests',
    );
  },

  approveConnectPayoutRequest(
    approvalRequestId: string,
  ): Promise<ApproveRejectResponse> {
    return adminFetch<ApproveRejectResponse>(
      `/carteira/connect/payout-requests/${encodeURIComponent(approvalRequestId)}/approve`,
      { method: 'POST' },
    );
  },

  rejectConnectPayoutRequest(
    approvalRequestId: string,
    reason?: string,
  ): Promise<ApproveRejectResponse> {
    return adminFetch<ApproveRejectResponse, { reason?: string }>(
      `/carteira/connect/payout-requests/${encodeURIComponent(approvalRequestId)}/reject`,
      { method: 'POST', body: reason ? { reason } : {} },
    );
  },

  listFraudBlacklist(
    query?: ListFraudBlacklistQuery,
  ): Promise<ListFraudBlacklistResponse> {
    const queryString = qs((query || {}) as Record<string, unknown>);
    return adminFetch<ListFraudBlacklistResponse>(
      queryString ? `/carteira/fraud/blacklist?${queryString}` : '/carteira/fraud/blacklist',
    );
  },

  addFraudBlacklist(body: AddFraudBlacklistBody): Promise<FraudBlacklistRow> {
    return adminFetch<FraudBlacklistRow, AddFraudBlacklistBody>('/carteira/fraud/blacklist', {
      method: 'POST',
      body,
    });
  },

  removeFraudBlacklist(
    body: RemoveFraudBlacklistBody,
  ): Promise<RemoveFraudBlacklistResponse> {
    return adminFetch<RemoveFraudBlacklistResponse, RemoveFraudBlacklistBody>(
      '/carteira/fraud/blacklist/remove',
      { method: 'POST', body },
    );
  },
};
