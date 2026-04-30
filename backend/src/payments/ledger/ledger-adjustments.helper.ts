import type { Logger } from '@nestjs/common';
import { type ConnectLedgerEntry, Prisma } from '@prisma/client';

import type { PrismaService } from '../../prisma/prisma.service';

import { FINANCIAL_TRANSACTION_OPTIONS, logLedgerWrite } from './ledger-audit.helper';
import { AccountBalanceNotFoundError, type CreditAvailableAdjustmentInput } from './ledger.types';

/**
 * Re-credit AVAILABLE after an operational correction (for example a payout
 * creation that failed after the local DEBIT_PAYOUT already landed).
 * Idempotent on `(reference.type, reference.id, ADJUSTMENT)`.
 */
export async function creditAvailableByAdjustmentImpl(
  prisma: PrismaService,
  logger: Logger,
  input: CreditAvailableAdjustmentInput,
): Promise<ConnectLedgerEntry> {
  if (input.amountCents <= 0n) {
    throw new RangeError(
      `creditAvailableByAdjustment: amountCents must be > 0 (got ${input.amountCents.toString()})`,
    );
  }

  // PULSE_OK: already in $transaction
  return prisma.$transaction(async (tx) => {
    const existing = await tx.connectLedgerEntry.findFirst({
      where: {
        referenceType: input.reference.type,
        referenceId: input.reference.id,
        type: 'ADJUSTMENT',
      },
    });
    if (existing) {
      logger.debug(
        `creditAvailableByAdjustment idempotent skip: ref=${input.reference.type}:${input.reference.id}`,
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

    const newAvailable = balance.availableBalanceCents + input.amountCents;
    const newLifetimePaidOut =
      balance.lifetimePaidOutCents >= input.amountCents
        ? balance.lifetimePaidOutCents - input.amountCents
        : 0n;

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
        type: 'ADJUSTMENT',
        amountCents: input.amountCents,
        balanceAfterPendingCents: balance.pendingBalanceCents,
        balanceAfterAvailableCents: newAvailable,
        referenceType: input.reference.type,
        referenceId: input.reference.id,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
      },
    });

    logLedgerWrite(
      logger,
      'adjustment',
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
