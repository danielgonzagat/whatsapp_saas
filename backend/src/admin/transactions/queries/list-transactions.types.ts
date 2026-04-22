import { OrderStatus, PaymentMethod } from '@prisma/client';

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
  status: OrderStatus;
  /** Payment method property. */
  paymentMethod: PaymentMethod;
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

/** List transactions input shape. */
export interface ListTransactionsInput {
  /** Search property. */
  search?: string;
  /** Status property. */
  status?: OrderStatus;
  /** Method property. */
  method?: PaymentMethod;
  /** Gateway property. */
  gateway?: string;
  /** Workspace id property. */
  workspaceId?: string;
  /** From property. */
  from?: Date;
  /** To property. */
  to?: Date;
  /** Skip property. */
  skip?: number;
  /** Take property. */
  take?: number;
}

/** List transactions result shape. */
export interface ListTransactionsResult {
  /** Items property. */
  items: AdminTransactionRow[];
  /** Total property. */
  total: number;
  /** Sum property. */
  sum: { totalInCents: number };
}
