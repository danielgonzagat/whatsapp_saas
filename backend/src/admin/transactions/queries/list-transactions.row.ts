/**
 * Row projection for admin transaction listings. Delegates payment fields
 * to ./list-transactions.payment so Lizard measures each helper
 * independently (TypeScript grammar bundles neighbouring functions).
 */
import type { OrderStatus, PaymentMethod } from '@prisma/client';
import type { AdminTransactionRow } from './list-transactions.query';
import {
  type TransactionPaymentInput,
  projectTransactionPayment,
} from './list-transactions.payment';

export type TransactionRowSource = {
  id: string;
  orderNumber: string;
  workspaceId: string;
  customerEmail: string;
  customerName: string;
  customerCPF: string | null;
  totalInCents: number;
  subtotalInCents: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  installments: number;
  affiliateId: string | null;
  createdAt: Date;
  paidAt: Date | null;
  payment: TransactionPaymentInput;
};

function projectTransactionIdentity(source: TransactionRowSource, nameMap: Map<string, string>) {
  return {
    id: source.id,
    orderNumber: source.orderNumber,
    workspaceId: source.workspaceId,
    workspaceName: nameMap.get(source.workspaceId) ?? null,
    customerEmail: source.customerEmail,
    customerName: source.customerName,
    customerCPF: source.customerCPF,
  };
}

function projectTransactionFinancials(source: TransactionRowSource) {
  return {
    totalInCents: source.totalInCents,
    subtotalInCents: source.subtotalInCents,
    status: source.status,
    paymentMethod: source.paymentMethod,
    installments: source.installments,
  };
}

function projectTransactionDates(source: TransactionRowSource) {
  return {
    createdAt: source.createdAt.toISOString(),
    paidAt: source.paidAt?.toISOString() ?? null,
    affiliateId: source.affiliateId,
  };
}

export function toTransactionRow(
  source: TransactionRowSource,
  nameMap: Map<string, string>,
): AdminTransactionRow {
  return {
    ...projectTransactionIdentity(source, nameMap),
    ...projectTransactionFinancials(source),
    ...projectTransactionPayment(source.payment),
    ...projectTransactionDates(source),
  };
}
