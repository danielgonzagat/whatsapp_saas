import { adminFetch } from './admin-client';

/** Platform wallet balance shape. */
export interface PlatformWalletBalance {
  currency: string;
  availableInCents: number;
  pendingInCents: number;
  reservedInCents: number;
  updatedAt: string;
}

/** Platform ledger kind type. */
export type PlatformLedgerKind =
  | 'PLATFORM_FEE_CREDIT'
  | 'CHARGEBACK_RESERVE'
  | 'REFUND_DEBIT'
  | 'CHARGEBACK_DEBIT'
  | 'PAYOUT_DEBIT'
  | 'ADJUSTMENT_CREDIT'
  | 'ADJUSTMENT_DEBIT'
  | 'RESERVE_RELEASE';

/** Platform ledger row shape. */
export interface PlatformLedgerRow {
  id: string;
  currency: string;
  direction: 'credit' | 'debit';
  bucket: 'AVAILABLE' | 'PENDING' | 'RESERVED';
  amountInCents: number;
  kind: PlatformLedgerKind;
  orderId: string | null;
  reason: string;
  createdAt: string;
}

/** List ledger response shape. */
export interface ListLedgerResponse {
  items: PlatformLedgerRow[];
  total: number;
}

/** Platform reconcile report shape. */
export interface PlatformReconcileReport {
  currency: string;
  runAt: string;
  ledgerAvailableInCents: number;
  ledgerPendingInCents: number;
  ledgerReservedInCents: number;
  walletAvailableInCents: number;
  walletPendingInCents: number;
  walletReservedInCents: number;
  availableDriftInCents: number;
  pendingDriftInCents: number;
  reservedDriftInCents: number;
  healthy: boolean;
}

/** List ledger query shape. */
export interface ListLedgerQuery {
  currency?: string;
  kind?: PlatformLedgerKind;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}

/** Admin carteira api. */
export const adminCarteiraApi = {
  balance(currency = 'BRL'): Promise<PlatformWalletBalance> {
    return adminFetch<PlatformWalletBalance>(
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
  reconcile(currency = 'BRL'): Promise<PlatformReconcileReport> {
    return adminFetch<PlatformReconcileReport>(
      `/carteira/reconcile?currency=${encodeURIComponent(currency)}`,
    );
  },
};
