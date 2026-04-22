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

/** Admin carteira api. */
export const adminCarteiraApi = {
  balance(currency = 'BRL'): Promise<MarketplaceTreasuryBalance> {
    return adminFetch<MarketplaceTreasuryBalance>(
      `/carteira/balance?currency=${encodeURIComponent(currency)}`,
    );
  },
  ledger(query: ListLedgerQuery = {}): Promise<ListLedgerResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return adminFetch<ListLedgerResponse>(qs ? `/carteira/ledger?${qs}` : '/carteira/ledger');
  },
  reconcile(currency = 'BRL'): Promise<MarketplaceTreasuryReconcileReport> {
    return adminFetch<MarketplaceTreasuryReconcileReport>(
      `/carteira/reconcile?currency=${encodeURIComponent(currency)}`,
    );
  },
};
