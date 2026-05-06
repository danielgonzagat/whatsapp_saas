import { AccountBalanceNotFoundError } from './ledger.types';
import { buildService, makeBalance, makePrismaStub } from './ledger.service.spec-helpers';

/**
 * LedgerService spec — defensive error paths.
 *
 * Validates that every public method raises the right typed error for
 * invalid inputs (zero amounts, unknown balances, missing entries) and that
 * the corner cases (PENDING-only debits, deficit drives, adjustment floor)
 * are handled deterministically.
 */

describe('LedgerService — error paths', () => {
  it('moveFromPendingToAvailable throws when entry not found', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(service.moveFromPendingToAvailable('cle_nonexistent')).rejects.toThrow(
      /entry not found/,
    );
  });

  it('moveFromPendingToAvailable throws AccountBalanceNotFoundError when balance disappears', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_orphan' },
    });
    stub.balances.delete('cab_seller');

    await expect(service.moveFromPendingToAvailable(credit.id)).rejects.toBeInstanceOf(
      AccountBalanceNotFoundError,
    );
  });

  it('debitAvailableForPayout throws for zero amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'payout', id: 'po_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('debitAvailableForPayout throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'payout', id: 'po_x' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('debitForChargeback throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.debitForChargeback({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'dispute', id: 'dp_missing' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('debitForChargeback throws for non-positive amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.debitForChargeback({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'dispute', id: 'dp_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('debitForRefund throws for zero amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.debitForRefund({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'refund', id: 're_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('debitForRefund throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.debitForRefund({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'refund', id: 're_missing' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('creditAvailableByAdjustment throws for zero amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.creditAvailableByAdjustment({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'adjustment', id: 'adj_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('creditAvailableByAdjustment throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.creditAvailableByAdjustment({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'adjustment', id: 'adj_missing' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('debitForChargeback absorbs entirely from AVAILABLE when PENDING is zero', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 0n, availableBalanceCents: 5_000n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 3_000n,
      reference: { type: 'dispute', id: 'dp_avail_only' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(2_000n);
    expect(balance?.lifetimeChargebacksCents).toBe(3_000n);
  });

  it('debitForRefund allows driving AVAILABLE negative', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 0n, availableBalanceCents: 0n }),
    ]);
    const service = await buildService(stub);

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      reference: { type: 'refund', id: 're_deficit' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(-1_000n);
  });

  it('creditAvailableByAdjustment floors lifetimePaidOut at 0 when adjustment exceeds it', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 0n, lifetimePaidOutCents: 100n }),
    ]);
    const service = await buildService(stub);

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 300n,
      reference: { type: 'adjustment', id: 'adj_floor' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.lifetimePaidOutCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(300n);
  });
});
