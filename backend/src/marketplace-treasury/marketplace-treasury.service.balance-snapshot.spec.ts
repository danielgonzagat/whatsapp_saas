import { MarketplaceTreasuryBucket, MarketplaceTreasuryLedgerKind } from '@prisma/client';

import { MarketplaceTreasuryService } from './marketplace-treasury.service';

/**
 * Money-ledgers migration (Stage 4) — flag-gated `balance_after_*_cents`
 * snapshot on MarketplaceTreasuryLedger writes. Default OFF must be
 * byte-identical to the legacy append (columns absent/NULL).
 */
describe('MarketplaceTreasuryService — KLOEL_LEDGER_BALANCE_SNAPSHOT', () => {
  const ENV_KEY = 'KLOEL_LEDGER_BALANCE_SNAPSHOT';
  let priorEnv: string | undefined;

  function buildService(wallet?: Record<string, unknown>) {
    const tx = {
      marketplaceTreasury: {
        upsert: jest.fn().mockResolvedValue({
          id: 'pw_brl',
          currency: 'BRL',
          availableBalanceInCents: 10_000n,
          pendingBalanceInCents: 2_000n,
          reservedBalanceInCents: 500n,
          ...wallet,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      marketplaceTreasuryLedger: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: (inner: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    return { tx, service: new MarketplaceTreasuryService(prisma as never) };
  }

  beforeEach(() => {
    priorEnv = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (priorEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = priorEnv;
    }
  });

  const createData = (tx: ReturnType<typeof buildService>['tx']) =>
    (tx.marketplaceTreasuryLedger.create.mock.calls as unknown[][])[0][0] as {
      data: Record<string, unknown>;
    };

  it('append flag OFF: no balance_after columns on the ledger row', async () => {
    delete process.env[ENV_KEY];
    const { service, tx } = buildService();

    await service.append({
      direction: 'credit',
      bucket: MarketplaceTreasuryBucket.PENDING,
      amountInCents: 3_000n,
      kind: MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
      reason: 'marketplace_fee_credit',
    });

    const { data } = createData(tx);
    expect(data).not.toHaveProperty('balanceAfterAvailableCents');
    expect(data).not.toHaveProperty('balanceAfterPendingCents');
    expect(data).not.toHaveProperty('balanceAfterReservedCents');
  });

  it('append flag ON: snapshots post-mutation balances across all three buckets', async () => {
    process.env[ENV_KEY] = 'true';
    const { service, tx } = buildService();

    // credit 3_000 to PENDING → pending 2_000 + 3_000 = 5_000; others unchanged.
    await service.append({
      direction: 'credit',
      bucket: MarketplaceTreasuryBucket.PENDING,
      amountInCents: 3_000n,
      kind: MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
      reason: 'marketplace_fee_credit',
    });

    const { data } = createData(tx);
    expect(data.balanceAfterAvailableCents).toBe(10_000n);
    expect(data.balanceAfterPendingCents).toBe(5_000n);
    expect(data.balanceAfterReservedCents).toBe(500n);
  });

  it('append flag ON debit: subtracts the magnitude from the touched bucket', async () => {
    process.env[ENV_KEY] = 'true';
    const { service, tx } = buildService();

    // debit 4_000 from AVAILABLE → available 10_000 - 4_000 = 6_000.
    await service.append({
      direction: 'debit',
      bucket: MarketplaceTreasuryBucket.AVAILABLE,
      amountInCents: 4_000n,
      kind: MarketplaceTreasuryLedgerKind.REFUND_DEBIT,
      reason: 'refund_debit',
    });

    const { data } = createData(tx);
    expect(data.balanceAfterAvailableCents).toBe(6_000n);
    expect(data.balanceAfterPendingCents).toBe(2_000n);
    expect(data.balanceAfterReservedCents).toBe(500n);
  });

  it('debitAvailableForPayout flag ON: snapshots available after the debit', async () => {
    process.env[ENV_KEY] = 'true';
    const { service, tx } = buildService();

    await service.debitAvailableForPayout({
      amountInCents: 5_000n,
      requestId: 'po_req_snap_1',
    });

    const { data } = createData(tx);
    expect(data.balanceAfterAvailableCents).toBe(5_000n);
    expect(data.balanceAfterPendingCents).toBe(2_000n);
    expect(data.balanceAfterReservedCents).toBe(500n);
  });

  it('creditAvailableByAdjustment flag ON: snapshots available after the credit', async () => {
    process.env[ENV_KEY] = 'true';
    const { service, tx } = buildService();

    await service.creditAvailableByAdjustment({
      amountInCents: 1_000n,
      requestId: 'adj_req_snap_1',
      reason: 'manual_adjustment_credit',
    });

    const { data } = createData(tx);
    expect(data.balanceAfterAvailableCents).toBe(11_000n);
  });
});
