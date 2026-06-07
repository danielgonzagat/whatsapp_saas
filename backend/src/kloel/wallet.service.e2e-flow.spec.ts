import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';

import { WalletLedgerService } from './wallet-ledger.service';
import { SellerWalletService } from './wallet.service';

/**
 * Integration-style flow spec for {@link SellerWalletService.requestWithdrawalCents}.
 *
 * Scope (production-grade contract — see CLAUDE.md "REGRA DE PAGAMENTOS"):
 *  - workspaceId isolation: wallet lookup must filter by workspaceId; another
 *    workspace must never read or debit this wallet;
 *  - bigint correctness: amount is bigint (centavos), never float;
 *  - idempotent retry: 3 consecutive identical requests within the 60s
 *    dedup window produce 1 single ledger row and return the same id;
 *  - error handling: invalid amount, missing PIX key, insufficient
 *    balance, missing wallet — each surfaces a typed Nest exception
 *    without touching the ledger.
 *
 * Every external collaborator is mocked. No real database, no real Stripe,
 * no real network — the entire $transaction body is exercised through an
 * in-memory tx client so we measure the actual orchestration code.
 */

interface FakeWalletRow {
  id: string;
  workspaceId: string;
  availableBalanceInCents: bigint;
}

interface FakeTxRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  amountInCents: bigint;
  type: string;
  metadata: Record<string, unknown>;
  walletId: string;
  createdAt: Date;
}

/**
 * Builds a stateful in-memory tx client that survives across calls within
 * a single test. Mirrors the slices of Prisma the withdrawal-cents flow
 * actually touches (`kloelWallet.findUnique` + `kloelWalletTransaction
 * .findMany` + `.create`).
 */
function buildStatefulTxClient(wallets: FakeWalletRow[]) {
  const ledger: FakeTxRow[] = [];
  let sequence = 0;

  return {
    ledger,
    client: {
      kloelWallet: {
        findUnique: jest.fn(async (args: { where: { workspaceId: string } }) => {
          return wallets.find((w) => w.workspaceId === args.where.workspaceId) ?? null;
        }),
      },
      kloelWalletTransaction: {
        findMany: jest.fn(
          async (args: {
            where: {
              walletId: string;
              type: string;
              status: string;
              amountInCents: bigint;
              createdAt: { gte: Date };
            };
          }) => {
            const since = args.where.createdAt.gte;
            return ledger.filter(
              (row) =>
                row.walletId === args.where.walletId &&
                row.type === args.where.type &&
                row.status === args.where.status &&
                row.amountInCents === args.where.amountInCents &&
                row.createdAt >= since,
            );
          },
        ),
        create: jest.fn(
          async (args: { data: Omit<FakeTxRow, 'id' | 'createdAt'>; select?: unknown }) => {
            sequence += 1;
            const row: FakeTxRow = {
              ...args.data,
              id: `wd-${sequence}`,
              status: args.data.status,
              createdAt: new Date(),
            };
            ledger.push(row);
            return { id: row.id, status: row.status };
          },
        ),
      },
    },
  };
}

describe('WalletService.requestWithdrawalCents (E2E flow)', () => {
  let service: SellerWalletService;
  let prisma: {
    $transaction: jest.Mock;
    kloelWallet: { findUnique: jest.Mock };
    kloelWalletTransaction: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      kloelWallet: { findUnique: jest.fn() },
      kloelWalletTransaction: { findMany: jest.fn(), create: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SellerWalletService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: FinancialAlertService,
          useValue: {
            paymentFailed: jest.fn(),
            withdrawalFailed: jest.fn(),
            webhookProcessingFailed: jest.fn(),
            reconciliationAlert: jest.fn(),
          },
        },
        {
          provide: WalletLedgerService,
          useValue: { appendWithinTx: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = moduleRef.get(SellerWalletService);
  });

  afterEach(() => jest.clearAllMocks());

  it('persists a single pending withdrawal row when called with valid PIX input', async () => {
    const wallets: FakeWalletRow[] = [
      { id: 'wallet-1', workspaceId: 'ws-1', availableBalanceInCents: 200_000n },
    ];
    const stateful = buildStatefulTxClient(wallets);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof stateful.client) => Promise<unknown>) => cb(stateful.client),
    );

    const result = await service.requestWithdrawalCents('ws-1', {
      amountCents: 50_000n,
      method: 'pix',
      pixKey: 'merchant@example.com',
    });

    expect(result.id).toBe('wd-1');
    expect(result.status).toBe('pending');
    expect(stateful.ledger).toHaveLength(1);
    expect(stateful.ledger[0].amountInCents).toBe(50_000n);
    expect(typeof stateful.ledger[0].amountInCents).toBe('bigint');
    expect(stateful.ledger[0].metadata).toMatchObject({
      workspaceId: 'ws-1',
      method: 'pix',
      pixKey: 'merchant@example.com',
      source: 'k30_resolver',
    });
  });

  it('returns the same row across 3 retries within 60s (idempotent — no double debit)', async () => {
    const wallets: FakeWalletRow[] = [
      { id: 'wallet-1', workspaceId: 'ws-1', availableBalanceInCents: 200_000n },
    ];
    const stateful = buildStatefulTxClient(wallets);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof stateful.client) => Promise<unknown>) => cb(stateful.client),
    );

    const args = {
      amountCents: 50_000n,
      method: 'pix' as const,
      pixKey: 'merchant@example.com',
    };

    const first = await service.requestWithdrawalCents('ws-1', args);
    const second = await service.requestWithdrawalCents('ws-1', args);
    const third = await service.requestWithdrawalCents('ws-1', args);

    expect(first.id).toBe('wd-1');
    expect(second.id).toBe('wd-1');
    expect(third.id).toBe('wd-1');
    expect(stateful.ledger).toHaveLength(1);
  });

  it('treats requests with different pixKey as distinct (no false-positive dedup)', async () => {
    const wallets: FakeWalletRow[] = [
      { id: 'wallet-1', workspaceId: 'ws-1', availableBalanceInCents: 200_000n },
    ];
    const stateful = buildStatefulTxClient(wallets);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof stateful.client) => Promise<unknown>) => cb(stateful.client),
    );

    const a = await service.requestWithdrawalCents('ws-1', {
      amountCents: 50_000n,
      method: 'pix',
      pixKey: 'merchant-a@example.com',
    });
    const b = await service.requestWithdrawalCents('ws-1', {
      amountCents: 50_000n,
      method: 'pix',
      pixKey: 'merchant-b@example.com',
    });

    expect(a.id).not.toBe(b.id);
    expect(stateful.ledger).toHaveLength(2);
  });

  it('isolates workspaces — ws-other never sees ws-1 wallet and gets NotFoundException', async () => {
    const wallets: FakeWalletRow[] = [
      { id: 'wallet-1', workspaceId: 'ws-1', availableBalanceInCents: 200_000n },
    ];
    const stateful = buildStatefulTxClient(wallets);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof stateful.client) => Promise<unknown>) => cb(stateful.client),
    );

    await expect(
      service.requestWithdrawalCents('ws-other', {
        amountCents: 50_000n,
        method: 'pix',
        pixKey: 'attacker@example.com',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(stateful.ledger).toHaveLength(0);
  });

  it('rejects with BadRequestException when amountCents exceeds available balance', async () => {
    const wallets: FakeWalletRow[] = [
      { id: 'wallet-1', workspaceId: 'ws-1', availableBalanceInCents: 10_000n },
    ];
    const stateful = buildStatefulTxClient(wallets);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof stateful.client) => Promise<unknown>) => cb(stateful.client),
    );

    await expect(
      service.requestWithdrawalCents('ws-1', {
        amountCents: 50_000n,
        method: 'transfer',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stateful.ledger).toHaveLength(0);
  });

  it('rejects amountCents <= 0n without entering $transaction', async () => {
    await expect(
      service.requestWithdrawalCents('ws-1', {
        amountCents: 0n,
        method: 'pix',
        pixKey: 'merchant@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unsupported method without entering $transaction', async () => {
    await expect(
      service.requestWithdrawalCents('ws-1', {
        amountCents: 50_000n,
        method: 'crypto' as unknown as 'pix',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects PIX withdrawal without pixKey before opening the transaction', async () => {
    await expect(
      service.requestWithdrawalCents('ws-1', {
        amountCents: 50_000n,
        method: 'pix',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts transfer method without pixKey', async () => {
    const wallets: FakeWalletRow[] = [
      { id: 'wallet-1', workspaceId: 'ws-1', availableBalanceInCents: 1_000_000n },
    ];
    const stateful = buildStatefulTxClient(wallets);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof stateful.client) => Promise<unknown>) => cb(stateful.client),
    );

    const result = await service.requestWithdrawalCents('ws-1', {
      amountCents: 25_000n,
      method: 'transfer',
    });

    expect(result.id).toBe('wd-1');
    expect(stateful.ledger[0].metadata).not.toHaveProperty('pixKey');
    expect(stateful.ledger[0].metadata).toMatchObject({
      method: 'transfer',
      workspaceId: 'ws-1',
    });
  });

  it('uses ReadCommitted isolation when running the withdrawal transaction', async () => {
    const wallets: FakeWalletRow[] = [
      { id: 'wallet-1', workspaceId: 'ws-1', availableBalanceInCents: 200_000n },
    ];
    const stateful = buildStatefulTxClient(wallets);
    prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof stateful.client) => Promise<unknown>) => cb(stateful.client),
    );

    await service.requestWithdrawalCents('ws-1', {
      amountCents: 50_000n,
      method: 'pix',
      pixKey: 'merchant@example.com',
    });

    type TxCall = readonly [unknown, { isolationLevel: string } | undefined];
    const calls = prisma.$transaction.mock.calls as readonly TxCall[];
    expect(calls[0]?.[1]?.isolationLevel).toBe('ReadCommitted');
  });
});
