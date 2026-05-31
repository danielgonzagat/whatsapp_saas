import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// @@index: read-only wallet queries extracted from wallet.service.ts (Wave 19)
// These helpers are pure reads — no $transaction boundaries, no idempotency
// keys, no ledger writes. They depend only on PrismaService.

// ── Types ──

export interface WalletBalance {
  available: number;
  pending: number;
  blocked: number;
  total: number;
}

export interface WalletTransactionHistoryResult {
  transactions: Array<{
    id: string;
    walletId: string;
    type: string;
    amount: number;
    description: string;
    status: string;
    reference: string | null;
    metadata: unknown;
    createdAt: Date;
  }>;
  total: number;
}

// ── Helpers ──

/**
 * 💰 Obtém saldo do workspace (read-only from caller perspective).
 * Uses upsert so the wallet row exists on first access, but no balance
 * mutation ever occurs from this path.
 */
export async function getWalletBalance(
  prisma: PrismaService,
  workspaceId: string,
): Promise<WalletBalance> {
  const wallet = await prisma.kloelWallet.upsert({
    where: { workspaceId },
    update: {},
    create: {
      workspaceId,
      availableBalance: 0,
      pendingBalance: 0,
      blockedBalance: 0,
    },
  });
  return {
    available: wallet.availableBalance,
    pending: wallet.pendingBalance,
    blocked: wallet.blockedBalance,
    total: wallet.availableBalance + wallet.pendingBalance + wallet.blockedBalance,
  };
}

/**
 * 📊 Histórico de transações (pure read, paginated).
 */
export async function getWalletTransactionHistory(
  prisma: PrismaService,
  workspaceId: string,
  page = 1,
  limit = 20,
  type?: string,
): Promise<WalletTransactionHistoryResult> {
  const where: Record<string, unknown> = { wallet: { workspaceId } };
  if (type) {
    where.type = type;
  }

  const [transactions, total] = await Promise.all([
    prisma.kloelWalletTransaction.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        walletId: true,
        type: true,
        amount: true,
        description: true,
        status: true,
        reference: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.kloelWalletTransaction.count({ where }),
  ]);

  return { transactions, total };
}

/**
 * 💰 K30 resolver entry-point: returns balances in bigint cents (the
 * source-of-truth representation post Wave 2 P6-2 / I11).
 *
 * Workspace isolation: filters by workspaceId. Throws NotFoundException
 * if the wallet row does not exist (matches resolver contract — never
 * lazily creates wallets on a query path).
 */
export async function getWalletBalanceCents(
  prisma: PrismaService,
  workspaceId: string,
): Promise<{ available: bigint; pending: bigint; blocked: bigint }> {
  const wallet = await prisma.kloelWallet.findUnique({
    where: { workspaceId },
    select: {
      availableBalanceInCents: true,
      pendingBalanceInCents: true,
      blockedBalanceInCents: true,
    },
  });
  if (!wallet) {
    throw new NotFoundException(`KloelWallet not found for workspace ${workspaceId}`);
  }
  return {
    available: wallet.availableBalanceInCents,
    pending: wallet.pendingBalanceInCents,
    blocked: wallet.blockedBalanceInCents,
  };
}
