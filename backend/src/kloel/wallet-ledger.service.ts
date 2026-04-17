import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * WalletLedgerService — append-only ledger writer (P6-4, I12).
 *
 * ## Why this exists
 *
 * Before Wave 2, KloelWallet stored its balances as direct mutable
 * columns. There was no audit trail of HOW a wallet got to its current
 * value, no way to reconstruct history, no way to detect drift between
 * the stored balance and the sequence of mutations that produced it.
 *
 * Wave 2 invariant I12 — Wallet Ledger Monotonicity — requires that
 * every mutation of a KloelWallet balance has a corresponding immutable
 * append-only entry in `KloelWalletLedger`, and that the balance is
 * derivable from the ledger by summing entries per (walletId, bucket,
 * direction).
 *
 * ## API surface
 *
 * Exactly one method: `appendWithinTx`. It accepts a Prisma transaction
 * client (NOT the top-level PrismaService) so the ledger append happens
 * INSIDE the same `$transaction` that mutates the wallet. There is no
 * "append outside a transaction" path because that would let a wallet
 * mutation succeed while its corresponding ledger entry fails — exactly
 * the inconsistency I12 forbids.
 *
 * ## Why not enforce at the DB level?
 *
 * A trigger could enforce "every UPDATE on KloelWallet must INSERT a
 * matching row into KloelWalletLedger in the same transaction". We
 * keep triggers out of scope because:
 *
 *   - The Prisma migration system makes triggers awkward to keep in
 *     sync (raw SQL that has no schema-level visibility).
 *   - The application path is a single function (`wallet.service.ts`),
 *     so a code-level audit + property tests give us the same guarantee
 *     with less infrastructure.
 *   - A future PR can promote this to a trigger if the audit reveals
 *     a code path that escapes the convention.
 *
 * Use the property test in `wallet.service.spec.ts` (`I12 ledger sum
 * equals balance`) as the standing verification.
 */
@Injectable()
export class WalletLedgerService {
  /**
   * Append a single ledger entry inside an existing Prisma transaction.
   *
   * @param tx The transaction client from `prisma.$transaction(async (tx) => ...)`.
   *           Do NOT pass the top-level PrismaService — that would defeat
   *           the atomicity guarantee.
   * @param entry The ledger row to append. `amountInCents` must be a
   *              non-negative bigint; sign is conveyed by `direction`.
   *
   * Throws if `amountInCents` is negative or non-finite — this is a
   * caller bug and must surface, not silently insert garbage.
   */
  async appendWithinTx(
    tx: Prisma.TransactionClient,
    entry: {
      workspaceId: string;
      walletId: string;
      transactionId: string | null;
      direction: 'credit' | 'debit';
      bucket: 'available' | 'pending' | 'blocked';
      amountInCents: bigint;
      reason: WalletLedgerReason;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (entry.amountInCents < 0n) {
      throw new Error(
        `WalletLedger.appendWithinTx: amountInCents must be non-negative; got ${entry.amountInCents}`,
      );
    }

    await tx.kloelWalletLedger.create({
      data: {
        workspaceId: entry.workspaceId,
        walletId: entry.walletId,
        transactionId: entry.transactionId,
        direction: entry.direction,
        bucket: entry.bucket,
        amountInCents: entry.amountInCents,
        reason: entry.reason,
        metadata: entry.metadata
          ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
}

/**
 * Structured `reason` values for ledger entries. Adding a new reason
 * here forces the call site author to consider whether the new
 * operation actually maintains the invariants of the ledger model.
 */
export type WalletLedgerReason =
  | 'sale_credit'
  | 'confirm_payment_credit'
  | 'confirm_payment_debit'
  | 'withdrawal_debit'
  | 'reconcile_settle_credit'
  | 'reconcile_settle_debit'
  | 'refund_debit'
  | 'chargeback_debit'
  | 'manual_adjustment_credit'
  | 'manual_adjustment_debit';
