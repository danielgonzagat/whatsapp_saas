import { buildService, makeBalance, makePrismaStub } from './ledger.service.spec-helpers';

/**
 * LedgerService spec — debit-side operations.
 *
 * Covers chargeback, refund, and adjustment paths. The setup mirrors the
 * core spec (in-memory Prisma stub) so the only thing that varies is which
 * service method is exercised.
 */

describe('LedgerService.debitForChargeback', () => {
  it('absorbs entirely from PENDING when reserve is sufficient', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 5_000n, availableBalanceCents: 0n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 3_000n,
      reference: { type: 'dispute', id: 'dp_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(2_000n);
    expect(balance?.availableBalanceCents).toBe(0n);
    expect(balance?.lifetimeChargebacksCents).toBe(3_000n);
  });

  it('spills into AVAILABLE when PENDING is insufficient', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_000n, availableBalanceCents: 5_000n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 4_000n,
      reference: { type: 'dispute', id: 'dp_spill' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(2_000n);
    expect(balance?.lifetimeChargebacksCents).toBe(4_000n);
  });

  it('drives AVAILABLE negative when both buckets are exhausted (deficit recoverable upstream)', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 0n, availableBalanceCents: 100n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      reference: { type: 'dispute', id: 'dp_deficit' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(-900n);
  });

  it('is idempotent on (reference, DEBIT_CHARGEBACK)', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_000n, availableBalanceCents: 0n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'dispute', id: 'dp_idem' },
    });
    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'dispute', id: 'dp_idem' },
    });

    expect(stub.entries.filter((e) => e.type === 'DEBIT_CHARGEBACK')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(500n);
  });
});

describe('LedgerService.debitForRefund', () => {
  it('consumes PENDING first and then spills into AVAILABLE', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_500n, availableBalanceCents: 5_000n }),
    ]);
    const service = await buildService(stub);

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 4_000n,
      reference: { type: 'refund', id: 're_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(2_500n);
    expect(stub.entries.find((e) => e.type === 'DEBIT_REFUND')?.amountCents).toBe(4_000n);
  });

  it('is idempotent on (reference, DEBIT_REFUND)', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_000n, availableBalanceCents: 500n }),
    ]);
    const service = await buildService(stub);

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'refund', id: 're_idem' },
    });
    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'refund', id: 're_idem' },
    });

    expect(stub.entries.filter((e) => e.type === 'DEBIT_REFUND')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(500n);
  });
});

describe('LedgerService.creditAvailableByAdjustment', () => {
  it('recredits AVAILABLE and reduces lifetimePaidOut', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 500n, lifetimePaidOutCents: 2_000n }),
    ]);
    const service = await buildService(stub);

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 900n,
      reference: { type: 'adjustment', id: 'adj_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(1_400n);
    expect(balance?.lifetimePaidOutCents).toBe(1_100n);
    expect(stub.entries.find((e) => e.type === 'ADJUSTMENT')?.amountCents).toBe(900n);
  });

  it('is idempotent on (reference, ADJUSTMENT)', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 100n, lifetimePaidOutCents: 300n }),
    ]);
    const service = await buildService(stub);

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 200n,
      reference: { type: 'adjustment', id: 'adj_idem' },
    });
    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 200n,
      reference: { type: 'adjustment', id: 'adj_idem' },
    });

    expect(stub.entries.filter((e) => e.type === 'ADJUSTMENT')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.availableBalanceCents).toBe(300n);
  });
});
