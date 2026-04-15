import { adminFetch } from './admin-client';

export type OrderStatusValue =
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELED'
  | 'REFUNDED'
  | 'CHARGEBACK';

export type PaymentMethodValue = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

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

export interface ListTransactionsResponse {
  items: AdminTransactionRow[];
  total: number;
  sum: { totalInCents: number };
}

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
};
