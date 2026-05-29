import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Inner transactional body for `WalletService.requestWithdrawalCents`.
 * Extracted from `wallet.service.tx.helpers.ts` (Claude-K88-split) to keep
 * the parent helper file under the 400-line per-file architectural cap.
 *
 * Invariants:
 *  - Balance check shares the $transaction snapshot with the row insert.
 *  - Workspace isolation via wallet resolved by workspaceId unique index.
 *  - Idempotency: 60-second dedup window via (walletId, type, status,
 *    amountInCents). An identical pending withdrawal within the window
 *    returns the existing row instead of creating a duplicate.
 *  - Amount is `bigint` (centavos), never `number` (CLAUDE.md money rule).
 */

/** Inputs for {@link runWithdrawalCentsTx}. */
export interface RunWithdrawalCentsTxArgs {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  amountCents: bigint;
  method: 'pix' | 'transfer';
  pixKey?: string;
}

export async function runWithdrawalCentsTx(
  args: RunWithdrawalCentsTxArgs,
): Promise<{ id: string; status: 'pending' | 'approved' | 'rejected' }> {
  const { tx, workspaceId, amountCents, method, pixKey } = args;

  const wallet = await tx.kloelWallet.findUnique({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      availableBalanceInCents: true,
    },
  });
  if (!wallet) {
    throw new NotFoundException(`KloelWallet not found for workspace ${workspaceId}`);
  }

  if (amountCents > wallet.availableBalanceInCents) {
    throw new BadRequestException('Insufficient available balance');
  }

  const sixtySecondsAgo = new Date(Date.now() - 60_000);
  const recent = await tx.kloelWalletTransaction.findMany({
    where: {
      walletId: wallet.id,
      type: 'withdrawal',
      status: 'pending',
      amountInCents: amountCents,
      createdAt: { gte: sixtySecondsAgo },
    },
    select: { id: true, status: true, metadata: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const dupe = recent.find((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    const sameMethod = meta?.method === method;
    const samePix = method === 'pix' ? meta?.pixKey === pixKey : true;
    return sameMethod && samePix;
  });
  if (dupe) {
    return {
      id: dupe.id,
      status: normalizeWithdrawalStatus(dupe.status),
    };
  }

  const created = await tx.kloelWalletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'withdrawal',
      amount: Number(amountCents) / 100,
      amountInCents: amountCents,
      description: `Saque ${method.toUpperCase()}`,
      status: 'pending',
      metadata: {
        workspaceId,
        method,
        ...(method === 'pix' && pixKey !== undefined ? { pixKey } : {}),
        source: 'k30_resolver',
      },
    },
    select: { id: true, status: true },
  });

  return {
    id: created.id,
    status: normalizeWithdrawalStatus(created.status),
  };
}

function normalizeWithdrawalStatus(raw: string): 'pending' | 'approved' | 'rejected' {
  if (raw === 'approved' || raw === 'rejected') {
    return raw;
  }
  return 'pending';
}
