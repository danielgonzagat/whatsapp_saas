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
  /** Id property. */
  id: string;
  /** Order number property. */
  orderNumber: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName: string | null;
  /** Customer email property. */
  customerEmail: string;
  /** Customer name property. */
  customerName: string;
  /** Customer cpf property. */
  customerCPF: string | null;
  /** Total in cents property. */
  totalInCents: number;
  /** Subtotal in cents property. */
  subtotalInCents: number;
  /** Status property. */
  status: OrderStatusValue;
  /** Payment method property. */
  paymentMethod: PaymentMethodValue;
  /** Payment status property. */
  paymentStatus: string | null;
  /** Gateway property. */
  gateway: string | null;
  /** Card brand property. */
  cardBrand: string | null;
  /** Card last4 property. */
  cardLast4: string | null;
  /** Installments property. */
  installments: number;
  /** Created at property. */
  createdAt: string;
  /** Paid at property. */
  paidAt: string | null;
  /** Affiliate id property. */
  affiliateId: string | null;
}

/** List transactions response shape. */
export interface ListTransactionsResponse {
  /** Items property. */
  items: AdminTransactionRow[];
  /** Total property. */
  total: number;
  /** Sum property. */
  sum: { totalInCents: number };
}

/** List transactions query shape. */
export interface ListTransactionsQuery {
  /** Search property. */
  search?: string;
  /** Status property. */
  status?: OrderStatusValue;
  /** Method property. */
  method?: PaymentMethodValue;
  /** Gateway property. */
  gateway?: string;
  /** Workspace id property. */
  workspaceId?: string;
  /** From property. */
  from?: string;
  /** To property. */
  to?: string;
  /** Skip property. */
  skip?: number;
  /** Take property. */
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
