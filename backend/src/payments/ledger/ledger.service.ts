import { Injectable, Logger } from '@nestjs/common';
import { type ConnectLedgerEntry, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { FINANCIAL_TRANSACTION_OPTIONS, logLedgerWrite } from './ledger-audit.helper';
import { creditAvailableByAdjustmentImpl } from './ledger-adjustments.helper';
import {
  AccountBalanceNotFoundError,
  type BalanceSnapshot,
  type CreditAvailableAdjustmentInput,
  type CreditPendingInput,
  type DebitChargebackInput,
  type DebitPayoutInput,
  type DebitRefundInput,
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
        select: {
          id: true,
          workspaceId: true,
          pendingBalanceCents: true,
          availableBalanceCents: true,
          lifetimeReceivedCents: true,
        },
      });
      if (!balance) {
        throw new AccountBalanceNotFoundError(input.accountBalanceId);
      }

      const newPending = balance.pendingBalanceCents + input.amountCents;
      const newLifetime = balance.lifetimeReceivedCents + input.amountCents;

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          pendingBalanceCents: newPending,
          lifetimeReceivedCents: newLifetime,
        },
        select: { workspaceId: true },
      });

      const created = await tx.connectLedgerEntry.create({
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

      logLedgerWrite(
        this.logger,
        'creditPending',
        {
          accountBalanceId: balance.id,
          workspaceId: balance.workspaceId,
          entryId: created.id,
          amountCents: input.amountCents,
        },
        {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          newPendingBalanceCents: newPending.toString(),
          newAvailableBalanceCents: balance.availableBalanceCents.toString(),
        },
      );

      return created;
    }, FINANCIAL_TRANSACTION_OPTIONS);
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
        select: {
          id: true,
          workspaceId: true,
          pendingBalanceCents: true,
          availableBalanceCents: true,
        },
      });
      if (!balance) {
        throw new AccountBalanceNotFoundError(entry.accountBalanceId);
      }

      const newPending = balance.pendingBalanceCents - entry.amountCents;
      const newAvailable = balance.availableBalanceCents + entry.amountCents;

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          pendingBalanceCents: newPending,
          availableBalanceCents: newAvailable,
        },
        select: { workspaceId: true },
      });

      await tx.connectLedgerEntry.update({
        where: { id: entry.id },
        data: { matured: true },
      });

      const matureEntry = await tx.connectLedgerEntry.create({
        data: {
          accountBalanceId: balance.id,
          type: 'MATURE',
          amountCents: entry.amountCents,
          balanceAfterPendingCents: newPending,
          balanceAfterAvailableCents: newAvailable,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          metadata: { promotedFromEntryId: entry.id },
        },
      });

      logLedgerWrite(
        this.logger,
        'mature',
        {
          accountBalanceId: balance.id,
          workspaceId: balance.workspaceId,
          entryId: matureEntry.id,
          amountCents: entry.amountCents,
        },
        {
          promotedFromEntryId: entry.id,
          newPendingBalanceCents: newPending.toString(),
          newAvailableBalanceCents: newAvailable.toString(),
        },
      );
    }, FINANCIAL_TRANSACTION_OPTIONS);
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
        select: {
          id: true,
          workspaceId: true,
          pendingBalanceCents: true,
          availableBalanceCents: true,
          lifetimePaidOutCents: true,
        },
      });
      if (!balance) {
        throw new AccountBalanceNotFoundError(input.accountBalanceId);
      }

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
        select: { workspaceId: true },
      });

      const created = await tx.connectLedgerEntry.create({
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

      logLedgerWrite(
        this.logger,
        'debitPayout',
        {
          accountBalanceId: balance.id,
          workspaceId: balance.workspaceId,
          entryId: created.id,
          amountCents: input.amountCents,
        },
        {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          newAvailableBalanceCents: newAvailable.toString(),
          newLifetimePaidOutCents: newLifetimePaidOut.toString(),
        },
      );

      return created;
    }, FINANCIAL_TRANSACTION_OPTIONS);
  }

  /**
   * Chargeback debit. Pulls from PENDING first (reserve buffer), spills into
   * AVAILABLE if exhausted; may drive AVAILABLE negative. Idempotent on
   * `(reference.type, reference.id, DEBIT_CHARGEBACK)`.
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
        select: {
          id: true,
          workspaceId: true,
          pendingBalanceCents: true,
          availableBalanceCents: true,
          lifetimeChargebacksCents: true,
        },
      });
      if (!balance) {
        throw new AccountBalanceNotFoundError(input.accountBalanceId);
      }

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
        select: { workspaceId: true },
      });

      const created = await tx.connectLedgerEntry.create({
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
          },
        },
      });

      logLedgerWrite(
        this.logger,
        'debitChargeback',
        {
          accountBalanceId: balance.id,
          workspaceId: balance.workspaceId,
          entryId: created.id,
          amountCents: input.amountCents,
        },
        {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          absorbedFromPendingCents: fromPending.toString(),
          absorbedFromAvailableCents: fromAvailable.toString(),
          newPendingBalanceCents: newPending.toString(),
          newAvailableBalanceCents: newAvailable.toString(),
          newLifetimeChargebacksCents: newLifetimeChargebacks.toString(),
        },
      );

      return created;
    }, FINANCIAL_TRANSACTION_OPTIONS);
  }

  /**
   * Refund debit. Operationally identical to chargeback: PENDING-first, may
   * drive AVAILABLE negative. Idempotent on
   * `(reference.type, reference.id, DEBIT_REFUND)`.
   */
  async debitForRefund(input: DebitRefundInput): Promise<ConnectLedgerEntry> {
    if (input.amountCents <= 0n) {
      throw new RangeError(
        `debitForRefund: amountCents must be > 0 (got ${input.amountCents.toString()})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          type: 'DEBIT_REFUND',
        },
      });
      if (existing) {
        this.logger.debug(
          `debitForRefund idempotent skip: ref=${input.reference.type}:${input.reference.id}`,
        );
        return existing;
      }

      const balance = await tx.connectAccountBalance.findUnique({
        where: { id: input.accountBalanceId },
        select: {
          id: true,
          workspaceId: true,
          pendingBalanceCents: true,
          availableBalanceCents: true,
        },
      });
      if (!balance) {
        throw new AccountBalanceNotFoundError(input.accountBalanceId);
      }

      const fromPending =
        balance.pendingBalanceCents >= input.amountCents
          ? input.amountCents
          : balance.pendingBalanceCents;
      const fromAvailable = input.amountCents - fromPending;
      const newPending = balance.pendingBalanceCents - fromPending;
      const newAvailable = balance.availableBalanceCents - fromAvailable;

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          pendingBalanceCents: newPending,
          availableBalanceCents: newAvailable,
        },
        select: { workspaceId: true },
      });

      const created = await tx.connectLedgerEntry.create({
        data: {
          accountBalanceId: balance.id,
          type: 'DEBIT_REFUND',
          amountCents: input.amountCents,
          balanceAfterPendingCents: newPending,
          balanceAfterAvailableCents: newAvailable,
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          metadata: {
            ...(input.metadata ?? {}),
            absorbedFromPendingCents: fromPending.toString(),
            absorbedFromAvailableCents: fromAvailable.toString(),
          },
        },
      });

      logLedgerWrite(
        this.logger,
        'debitRefund',
        {
          accountBalanceId: balance.id,
          workspaceId: balance.workspaceId,
          entryId: created.id,
          amountCents: input.amountCents,
        },
        {
          referenceType: input.reference.type,
          referenceId: input.reference.id,
          absorbedFromPendingCents: fromPending.toString(),
          absorbedFromAvailableCents: fromAvailable.toString(),
          newPendingBalanceCents: newPending.toString(),
          newAvailableBalanceCents: newAvailable.toString(),
        },
      );

      return created;
    }, FINANCIAL_TRANSACTION_OPTIONS);
  }

  /** Delegates to {@link creditAvailableByAdjustmentImpl}. */
  async creditAvailableByAdjustment(
    input: CreditAvailableAdjustmentInput,
  ): Promise<ConnectLedgerEntry> {
    return creditAvailableByAdjustmentImpl(this.prisma, this.logger, input);
  }

  /** Get balance. */
  async getBalance(accountBalanceId: string): Promise<BalanceSnapshot> {
    const balance = await this.prisma.connectAccountBalance.findUnique({
      where: { id: accountBalanceId },
      select: {
        id: true,
        workspaceId: true,
        stripeAccountId: true,
        accountType: true,
        pendingBalanceCents: true,
        availableBalanceCents: true,
        lifetimeReceivedCents: true,
        lifetimePaidOutCents: true,
        lifetimeChargebacksCents: true,
      },
    });
    if (!balance) {
      throw new AccountBalanceNotFoundError(accountBalanceId);
    }
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
