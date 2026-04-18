import { Injectable, Logger } from '@nestjs/common';
import type { ConnectLedgerEntry, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import {
  AccountBalanceNotFoundError,
  type BalanceSnapshot,
  type CreditPendingInput,
  type DebitChargebackInput,
  type DebitPayoutInput,
  InsufficientAvailableBalanceError,
} from './ledger.types';

/**
 * Connect Ledger orchestration. Implements the dual-balance contract from
 * ADR 0003: every credit lands as PENDING, matures into AVAILABLE on its
 * scheduled date, and only AVAILABLE may be debited for payouts. Chargebacks
 * cascade from PENDING to AVAILABLE so reserve buffers absorb them first.
 *
 * All monetary writes happen inside `prisma.$transaction` so concurrent
 * writers see consistent balances. The unique constraint on
 * (reference_type, reference_id, type) is the database-level idempotency
 * guard — duplicate webhook deliveries are turned into no-ops below
 * before they reach the constraint.
 *
 * Append-only: ledger entries are never UPDATEd. Maturation flips the
 * `matured` flag on the original CREDIT_PENDING and inserts a new MATURE
 * entry. Corrections insert ADJUSTMENT entries.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a new pending credit with a maturation date. Idempotent on
   * `(reference.type, reference.id, CREDIT_PENDING)`.
   */
  async creditPending(input: CreditPendingInput): Promise<ConnectLedgerEntry> {
    if (input.amountCents <= 0n) {
      throw new RangeError(
        `creditPending: amountCents must be > 0 (got ${input.amountCents.toString()})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          type: 'CREDIT_PENDING',
        },
      });
      if (existing) {
        this.logger.debug(
          `creditPending idempotent skip: ref=${input.reference.type}:${input.reference.id} entry=${existing.id}`,
        );
        return existing;
      }

      const balance = await tx.connectAccountBalance.findUnique({
        where: { id: input.accountBalanceId },
      });
      if (!balance) throw new AccountBalanceNotFoundError(input.accountBalanceId);

      const newPending = balance.pendingBalanceCents + input.amountCents;
      const newLifetime = balance.lifetimeReceivedCents + input.amountCents;

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          pendingBalanceCents: newPending,
          lifetimeReceivedCents: newLifetime,
        },
      });

      return tx.connectLedgerEntry.create({
        data: {
          accountBalanceId: balance.id,
          type: 'CREDIT_PENDING',
          amountCents: input.amountCents,
          balanceAfterPendingCents: newPending,
          balanceAfterAvailableCents: balance.availableBalanceCents,
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          scheduledFor: input.matureAt,
          matured: false,
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
        },
      });
    });
  }

  /**
   * Mark a previously-pending entry as matured: subtract from PENDING, add to
   * AVAILABLE, append a MATURE row. Idempotent on the entry id (calling twice
   * is a no-op once `matured` is true).
   */
  async moveFromPendingToAvailable(pendingEntryId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.connectLedgerEntry.findUnique({
        where: { id: pendingEntryId },
      });
      if (!entry) {
        throw new Error(`moveFromPendingToAvailable: entry not found id=${pendingEntryId}`);
      }
      if (entry.type !== 'CREDIT_PENDING') {
        throw new Error(
          `moveFromPendingToAvailable: entry ${pendingEntryId} is not CREDIT_PENDING (type=${entry.type})`,
        );
      }
      if (entry.matured) {
        this.logger.debug(`moveFromPendingToAvailable idempotent skip: entry=${pendingEntryId}`);
        return;
      }

      const balance = await tx.connectAccountBalance.findUnique({
        where: { id: entry.accountBalanceId },
      });
      if (!balance) throw new AccountBalanceNotFoundError(entry.accountBalanceId);

      const newPending = balance.pendingBalanceCents - entry.amountCents;
      const newAvailable = balance.availableBalanceCents + entry.amountCents;

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          pendingBalanceCents: newPending,
          availableBalanceCents: newAvailable,
        },
      });

      await tx.connectLedgerEntry.update({
        where: { id: entry.id },
        data: { matured: true },
      });

      await tx.connectLedgerEntry.create({
        data: {
          accountBalanceId: balance.id,
          type: 'MATURE',
          amountCents: entry.amountCents,
          balanceAfterPendingCents: newPending,
          balanceAfterAvailableCents: newAvailable,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          metadata: { promotedFromEntryId: entry.id } as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Debit AVAILABLE for a payout. Throws InsufficientAvailableBalanceError
   * if the requested amount exceeds available. Idempotent on
   * `(reference.type, reference.id, DEBIT_PAYOUT)`.
   */
  async debitAvailableForPayout(input: DebitPayoutInput): Promise<ConnectLedgerEntry> {
    if (input.amountCents <= 0n) {
      throw new RangeError(
        `debitAvailableForPayout: amountCents must be > 0 (got ${input.amountCents.toString()})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          type: 'DEBIT_PAYOUT',
        },
      });
      if (existing) {
        this.logger.debug(
          `debitAvailableForPayout idempotent skip: ref=${input.reference.type}:${input.reference.id}`,
        );
        return existing;
      }

      const balance = await tx.connectAccountBalance.findUnique({
        where: { id: input.accountBalanceId },
      });
      if (!balance) throw new AccountBalanceNotFoundError(input.accountBalanceId);

      if (balance.availableBalanceCents < input.amountCents) {
        throw new InsufficientAvailableBalanceError(
          balance.id,
          input.amountCents,
          balance.availableBalanceCents,
        );
      }

      const newAvailable = balance.availableBalanceCents - input.amountCents;
      const newLifetimePaidOut = balance.lifetimePaidOutCents + input.amountCents;

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          availableBalanceCents: newAvailable,
          lifetimePaidOutCents: newLifetimePaidOut,
        },
      });

      return tx.connectLedgerEntry.create({
        data: {
          accountBalanceId: balance.id,
          type: 'DEBIT_PAYOUT',
          amountCents: input.amountCents,
          balanceAfterPendingCents: balance.pendingBalanceCents,
          balanceAfterAvailableCents: newAvailable,
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
        },
      });
    });
  }

  /**
   * Apply a chargeback debit. Pulls from PENDING first (reserve buffer),
   * spills into AVAILABLE if PENDING is exhausted. Allowed to drive
   * AVAILABLE negative — the caller must surface the resulting deficit
   * separately if it cannot be recovered from a downstream actor.
   *
   * Idempotent on `(reference.type, reference.id, DEBIT_CHARGEBACK)`.
   */
  async debitForChargeback(input: DebitChargebackInput): Promise<ConnectLedgerEntry> {
    if (input.amountCents <= 0n) {
      throw new RangeError(
        `debitForChargeback: amountCents must be > 0 (got ${input.amountCents.toString()})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          type: 'DEBIT_CHARGEBACK',
        },
      });
      if (existing) {
        this.logger.debug(
          `debitForChargeback idempotent skip: ref=${input.reference.type}:${input.reference.id}`,
        );
        return existing;
      }

      const balance = await tx.connectAccountBalance.findUnique({
        where: { id: input.accountBalanceId },
      });
      if (!balance) throw new AccountBalanceNotFoundError(input.accountBalanceId);

      const fromPending =
        balance.pendingBalanceCents >= input.amountCents
          ? input.amountCents
          : balance.pendingBalanceCents;
      const fromAvailable = input.amountCents - fromPending;
      const newPending = balance.pendingBalanceCents - fromPending;
      const newAvailable = balance.availableBalanceCents - fromAvailable;
      const newLifetimeChargebacks = balance.lifetimeChargebacksCents + input.amountCents;

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          pendingBalanceCents: newPending,
          availableBalanceCents: newAvailable,
          lifetimeChargebacksCents: newLifetimeChargebacks,
        },
      });

      return tx.connectLedgerEntry.create({
        data: {
          accountBalanceId: balance.id,
          type: 'DEBIT_CHARGEBACK',
          amountCents: input.amountCents,
          balanceAfterPendingCents: newPending,
          balanceAfterAvailableCents: newAvailable,
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          metadata: {
            ...(input.metadata ?? {}),
            absorbedFromPendingCents: fromPending.toString(),
            absorbedFromAvailableCents: fromAvailable.toString(),
          } as Prisma.InputJsonValue,
        },
      });
    });
  }

  async getBalance(accountBalanceId: string): Promise<BalanceSnapshot> {
    const balance = await this.prisma.connectAccountBalance.findUnique({
      where: { id: accountBalanceId },
    });
    if (!balance) throw new AccountBalanceNotFoundError(accountBalanceId);
    return {
      accountBalanceId: balance.id,
      stripeAccountId: balance.stripeAccountId,
      accountType: balance.accountType,
      pendingCents: balance.pendingBalanceCents,
      availableCents: balance.availableBalanceCents,
      lifetimeReceivedCents: balance.lifetimeReceivedCents,
      lifetimePaidOutCents: balance.lifetimePaidOutCents,
      lifetimeChargebacksCents: balance.lifetimeChargebacksCents,
    };
  }
}
