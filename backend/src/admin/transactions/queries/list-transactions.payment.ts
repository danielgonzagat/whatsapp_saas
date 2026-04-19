/**
 * Payment projection for admin transaction rows. Isolated in its own
 * file so Lizard does not bundle the four `??`-heavy lines into the
 * parent row mapper (which already contains its own chain of optional
 * fields).
 */
import type { AdminTransactionRow } from './list-transactions.query';

export type TransactionPaymentInput = {
  gateway: string | null;
  status: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
} | null;

export type TransactionPaymentProjection = Pick<
  AdminTransactionRow,
  'paymentStatus' | 'gateway' | 'cardBrand' | 'cardLast4'
>;

export function projectTransactionPayment(
  payment: TransactionPaymentInput,
): TransactionPaymentProjection {
  return {
    paymentStatus: payment?.status ?? null,
    gateway: payment?.gateway ?? null,
    cardBrand: payment?.cardBrand ?? null,
    cardLast4: payment?.cardLast4 ?? null,
  };
}
