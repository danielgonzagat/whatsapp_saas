import { adminFetch } from './admin-client';

/** Order status value type. */
export type OrderStatusValue =
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELED'
  | 'REFUNDED'
  | 'CHARGEBACK';

/** Payment method value type. */
export type PaymentMethodValue = 'CREDIT_CARD' | 'PIX' | 'BOLETO';
/** Admin transaction action type. */
export type AdminTransactionAction = 'REFUND' | 'CHARGEBACK';

/** Admin transaction row shape. */
export interface AdminTransactionRow {
  id: string;
  orderNumber: string;
  workspaceId: string;
  workspaceName: string | null;
  customerEmail: string;
  customerName: string;
  customerCPF: string | null;
  totalInCents: number;
  subtotalInCents: number;
  status: OrderStatusValue;
  paymentMethod: PaymentMethodValue;
  paymentStatus: string | null;
  gateway: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  installments: number;
  createdAt: string;
  paidAt: string | null;
  affiliateId: string | null;
}

/** List transactions response shape. */
export interface ListTransactionsResponse {
  items: AdminTransactionRow[];
  total: number;
  sum: { totalInCents: number };
}

/** List transactions query shape. */
export interface ListTransactionsQuery {
  search?: string;
  status?: OrderStatusValue;
  method?: PaymentMethodValue;
  gateway?: string;
  workspaceId?: string;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}

/** Admin transactions api. */
export const adminTransactionsApi = {
  list(query: ListTransactionsQuery = {}): Promise<ListTransactionsResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return adminFetch<ListTransactionsResponse>(qs ? `/transactions?${qs}` : '/transactions');
  },
  operate(orderId: string, body: { action: AdminTransactionAction; note?: string }) {
    return adminFetch<void>(`/transactions/${encodeURIComponent(orderId)}/operate`, {
      method: 'POST',
      body,
    });
  },
};
