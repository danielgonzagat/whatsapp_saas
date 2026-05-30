import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { SpineEmitterService } from '../../kloel/spine/spine-emitter.service';
import type { ConnectLedgerEntry } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { toPrismaJsonValue } from '../../common/prisma/prisma-json.util';

import { FINANCIAL_TRANSACTION_OPTIONS, logLedgerWrite } from './ledger-audit.helper';
import { creditAvailableByAdjustmentImpl } from './ledger-adjustments.helper';
import { isLedgerIdempotencyRecoveryCode, mapBalanceToSnapshot } from './ledger-entry.helper';
import {
  applyAbsorptionDebit,
  assertPositiveAmount,
  buildAbsorptionMetadata,
} from './ledger-math.helper';
import {
  buildAbsorptionDebitAuditDetails,
  buildCreditPendingAuditDetails,
  buildDebitPayoutAuditDetails,
  buildLedgerReferenceIdempotencyWhere,
  buildMatureAuditDetails,
  buildMatureEntryMetadata,
  computeCreditPendingBalanceDelta,
  computeDebitPayoutBalanceDelta,
  computeMatureBalanceDelta,
  mapIdempotencyRecoveryReason,
} from './ledger.service.helpers';
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
  private readonly logger = StructuredLogger.from(LedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {}

  /**
   * Emit a canonical commerce.payment.* spine event AFTER the ledger
   * transaction has already committed successfully. Emission is
   * fire-and-forget and never throws — the money path is sacred, exactly
   * as documented on {@link SpineEmitterService}. A missing spine (DI
   * @Optional) is a silent no-op so this stays decoupled from MIND wiring.
   *
   * This does NOT mutate any balance, amount, or ledger row — it only
   * publishes a read-only signal so downstream cognitive consumers
   * (analytics, autopilot, brain/mind) observe payment state changes.
   */
  private emitPaymentSpineEvent(
    eventName:
      | 'commerce.payment.approved'
      | 'commerce.payment.refunded'
      | 'commerce.payment.charged_back',
    entry: ConnectLedgerEntry,
    workspaceId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    if (!this.spine) {
      return;
    }
    void this.spine
      .emit({
        eventName,
        workspaceId,
        entityRef: { entityType: 'ledger_entry', entityId: entry.id },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'ledger-service',
          processorVersion: '1.0.0',
          schemaVersion: '1.0.0',
        },
        payload: {
          ledgerEntryId: entry.id,
          accountBalanceId: entry.accountBalanceId,
          amountCents: entry.amountCents.toString(),
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          ...payload,
        },
      })
      .catch(() => undefined);
  }

  /**
   * Record a new pending credit with a maturation date. Idempotent on
   * `(reference.type, reference.id, CREDIT_PENDING)`.
   */
  async creditPending(input: CreditPendingInput): Promise<ConnectLedgerEntry> {
    assertPositiveAmount(input.amountCents, 'creditPending');

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: buildLedgerReferenceIdempotencyWhere(input.reference, 'CREDIT_PENDING'),
      });
      if (existing) {
        this.logger.debug(
          `creditPending idempotent skip: ref=${input.reference.type}:${input.reference.id} entry=${existing.id}`,
        );
        return { entry: existing, isNew: false, workspaceId: undefined as string | undefined };
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

      const { newPending, newLifetimeReceived } = computeCreditPendingBalanceDelta(
        balance.pendingBalanceCents,
        balance.lifetimeReceivedCents,
        input.amountCents,
      );

      await tx.connectAccountBalance.update({
        where: { id: balance.id },
        data: {
          pendingBalanceCents: newPending,
          lifetimeReceivedCents: newLifetimeReceived,
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
          ...(input.metadata ? { metadata: toPrismaJsonValue(input.metadata) } : {}),
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
        buildCreditPendingAuditDetails(input.reference, newPending, balance.availableBalanceCents),
      );

      return { entry: created, isNew: true, workspaceId: balance.workspaceId };
    }, FINANCIAL_TRANSACTION_OPTIONS);

    if (result.isNew && result.workspaceId) {
      this.emitPaymentSpineEvent('commerce.payment.approved', result.entry, result.workspaceId, {
        phase: 'credit_pending',
      });
    }

    return result.entry;
  }

  /**
   * Mark a previously-pending entry as matured: subtract from PENDING, add to
   * AVAILABLE, append a MATURE row. Idempotent on the entry id (calling twice
   * is a no-op once `matured` is true).
   */
  async moveFromPendingToAvailable(pendingEntryId: string): Promise<void> {
    let matured: { entry: ConnectLedgerEntry; workspaceId: string } | undefined;
    try {
      matured = await this.prisma.$transaction(async (tx) => {
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
          return undefined;
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

        const { newPending, newAvailable } = computeMatureBalanceDelta(
          balance.pendingBalanceCents,
          balance.availableBalanceCents,
          entry.amountCents,
        );

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
            metadata: buildMatureEntryMetadata(entry.id),
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
          buildMatureAuditDetails(entry.id, newPending, newAvailable),
        );

        return { entry: matureEntry, workspaceId: balance.workspaceId };
      }, FINANCIAL_TRANSACTION_OPTIONS);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        isLedgerIdempotencyRecoveryCode(error.code)
      ) {
        const reason = mapIdempotencyRecoveryReason(error.code);
        this.logger.info(
          `moveFromPendingToAvailable idempotent skip (${reason}): entry=${pendingEntryId}`,
        );
        return;
      }
      throw error;
    }

    if (matured) {
      this.emitPaymentSpineEvent('commerce.payment.approved', matured.entry, matured.workspaceId, {
        phase: 'matured',
      });
    }
  }

  /**
   * Debit AVAILABLE for a payout. Throws InsufficientAvailableBalanceError
   * if the requested amount exceeds available. Idempotent on
   * `(reference.type, reference.id, DEBIT_PAYOUT)`.
   */
  async debitAvailableForPayout(input: DebitPayoutInput): Promise<ConnectLedgerEntry> {
    assertPositiveAmount(input.amountCents, 'debitAvailableForPayout');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: buildLedgerReferenceIdempotencyWhere(input.reference, 'DEBIT_PAYOUT'),
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

      const { newAvailable, newLifetimePaidOut } = computeDebitPayoutBalanceDelta(
        balance.availableBalanceCents,
        balance.lifetimePaidOutCents,
        input.amountCents,
      );

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
          ...(input.metadata ? { metadata: toPrismaJsonValue(input.metadata) } : {}),
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
        buildDebitPayoutAuditDetails(input.reference, newAvailable, newLifetimePaidOut),
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
    assertPositiveAmount(input.amountCents, 'debitForChargeback');

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: buildLedgerReferenceIdempotencyWhere(input.reference, 'DEBIT_CHARGEBACK'),
      });
      if (existing) {
        this.logger.debug(
          `debitForChargeback idempotent skip: ref=${input.reference.type}:${input.reference.id}`,
        );
        return { entry: existing, isNew: false, workspaceId: undefined as string | undefined };
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

      const { fromPending, fromAvailable, newPending, newAvailable } = applyAbsorptionDebit(
        input.amountCents,
        balance.pendingBalanceCents,
        balance.availableBalanceCents,
      );
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
          metadata: toPrismaJsonValue(
            buildAbsorptionMetadata(input.metadata, fromPending, fromAvailable),
          ),
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
        buildAbsorptionDebitAuditDetails(
          input.reference,
          fromPending,
          fromAvailable,
          newPending,
          newAvailable,
          newLifetimeChargebacks,
        ),
      );

      return { entry: created, isNew: true, workspaceId: balance.workspaceId };
    }, FINANCIAL_TRANSACTION_OPTIONS);

    if (result.isNew && result.workspaceId) {
      this.emitPaymentSpineEvent(
        'commerce.payment.charged_back',
        result.entry,
        result.workspaceId,
        {},
      );
    }

    return result.entry;
  }

  /**
   * Refund debit. Operationally identical to chargeback: PENDING-first, may
   * drive AVAILABLE negative. Idempotent on
   * `(reference.type, reference.id, DEBIT_REFUND)`.
   */
  async debitForRefund(input: DebitRefundInput): Promise<ConnectLedgerEntry> {
    assertPositiveAmount(input.amountCents, 'debitForRefund');

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.connectLedgerEntry.findFirst({
        where: buildLedgerReferenceIdempotencyWhere(input.reference, 'DEBIT_REFUND'),
      });
      if (existing) {
        this.logger.debug(
          `debitForRefund idempotent skip: ref=${input.reference.type}:${input.reference.id}`,
        );
        return { entry: existing, isNew: false, workspaceId: undefined as string | undefined };
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

      const { fromPending, fromAvailable, newPending, newAvailable } = applyAbsorptionDebit(
        input.amountCents,
        balance.pendingBalanceCents,
        balance.availableBalanceCents,
      );

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
          metadata: toPrismaJsonValue(
            buildAbsorptionMetadata(input.metadata, fromPending, fromAvailable),
          ),
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
        buildAbsorptionDebitAuditDetails(
          input.reference,
          fromPending,
          fromAvailable,
          newPending,
          newAvailable,
        ),
      );

      return { entry: created, isNew: true, workspaceId: balance.workspaceId };
    }, FINANCIAL_TRANSACTION_OPTIONS);

    if (result.isNew && result.workspaceId) {
      this.emitPaymentSpineEvent('commerce.payment.refunded', result.entry, result.workspaceId, {});
    }

    return result.entry;
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
    return mapBalanceToSnapshot(balance);
  }
}
