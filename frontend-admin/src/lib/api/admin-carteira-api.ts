import { adminFetch } from './admin-client';

export interface PlatformWalletBalance {
  currency: string;
  availableInCents: number;
  pendingInCents: number;
  reservedInCents: number;
  updatedAt: string;
}

export type PlatformLedgerKind =
  | 'PLATFORM_FEE_CREDIT'
  | 'CHARGEBACK_RESERVE'
  | 'REFUND_DEBIT'
  | 'CHARGEBACK_DEBIT'
  | 'PAYOUT_DEBIT'
  | 'ADJUSTMENT_CREDIT'
  | 'ADJUSTMENT_DEBIT'
  | 'RESERVE_RELEASE';

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

export interface ListLedgerResponse {
  items: PlatformLedgerRow[];
  total: number;
}

export interface ListLedgerQuery {
  currency?: string;
  kind?: PlatformLedgerKind;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}

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
};
