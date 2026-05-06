import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Default transaction options for financial mutations: Serializable isolation
 * blocks dirty reads and write skew, which is the contract our ledger relies
 * on (see ADR 0003).
 */
export const FINANCIAL_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

/**
 * Structured audit-log payload for connect ledger writes.
 * Every monetary mutation in {@link LedgerService} emits one of these so
 * downstream observability tools (Datadog, Sentry breadcrumbs, ad-hoc grep)
 * can reconstruct balance history without replaying the database.
 */
type LedgerWriteAuditBase = {
  accountBalanceId: string;
  workspaceId: string;
  entryId: string;
  amountCents: bigint;
};

type LedgerOperation =
  | 'creditPending'
  | 'mature'
  | 'debitPayout'
  | 'debitChargeback'
  | 'debitRefund'
  | 'adjustment';

/** Emit a `connect_ledger_write` audit log entry with consistent shape. */
export function logLedgerWrite(
  logger: Logger,
  operation: LedgerOperation,
  base: LedgerWriteAuditBase,
  extras: Record<string, string>,
): void {
  logger.log({
    event: 'connect_ledger_write',
    operation,
    accountBalanceId: base.accountBalanceId,
    workspaceId: base.workspaceId,
    entryId: base.entryId,
    amountCents: base.amountCents.toString(),
    ...extras,
  });
}
