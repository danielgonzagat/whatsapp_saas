import { buildService, makeBalance, makePrismaStub } from './ledger.service.spec-helpers';

/**
 * LedgerService spec — global invariants and concurrency.
 *
 * Two classes of properties:
 *   1. Conservation: pending + available always equals
 *      lifetimeReceived - lifetimePaidOut - lifetimeChargebacks. This must
 *      hold no matter how the operations interleave.
 *   2. Concurrency: simultaneous debits on the same balance must not drive
 *      AVAILABLE negative through interleaving (the service relies on the
 *      transaction boundary inside `$transaction`). Promise.allSettled is a
 *      proxy for that — at least one outcome is fulfilled and the final
 *      state stays >= 0.
 */

describe('LedgerService — conservation invariants', () => {
  it('pending + available always equals lifetimeReceived - lifetimePaidOut - lifetimeChargebacks', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit1 = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 10_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_inv_1' },
    });
    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_inv_2' },
    });
    await service.moveFromPendingToAvailable(credit1.id);
    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 4_000n,
      reference: { type: 'payout', id: 'po_inv' },
    });
    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      reference: { type: 'dispute', id: 'dp_inv' },
    });

    const b = stub.balances.get('cab_seller');
    expect(b.pendingBalanceCents + b.availableBalanceCents).toBe(
      b.lifetimeReceivedCents - b.lifetimePaidOutCents - b.lifetimeChargebacksCents,
    );
  });
});

describe('LedgerService — concurrency', () => {
  it('serialises concurrent debits on the same balance preventing overdraft', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 1_000n })]);
    const service = await buildService(stub);

    const results = await Promise.allSettled([
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 600n,
        reference: { type: 'payout', id: 'po_concurrent_a' },
      }),
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 500n,
        reference: { type: 'payout', id: 'po_concurrent_b' },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length + rejected.length).toBe(2);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBeGreaterThanOrEqual(0n);
  });
});

describe('LedgerService — double-entry conservation', () => {
  it('total credits minus total debits equals final balance', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const c1 = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 50_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_de1' },
    });
    const _c2 = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 30_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_de2' },
    });
    await service.moveFromPendingToAvailable(c1.id);
    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 20_000n,
      reference: { type: 'payout', id: 'po_de1' },
    });
    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      reference: { type: 'dispute', id: 'dp_de1' },
    });
    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 10_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_de3' },
    });

    const balance = stub.balances.get('cab_seller');

    const totalCredits = stub.entries
      .filter((e) => e.type === 'CREDIT_PENDING')
      .reduce((sum, e) => sum + e.amountCents, 0n);
    const totalDebits = stub.entries
      .filter((e) =>
        ['DEBIT_PAYOUT', 'DEBIT_CHARGEBACK', 'DEBIT_REFUND', 'MATURE'].includes(e.type),
      )
      .reduce((sum, e) => {
        if (e.type === 'MATURE') return sum;
        return sum + e.amountCents;
      }, 0n);

    expect(balance?.pendingBalanceCents + balance?.availableBalanceCents).toBe(
      totalCredits - totalDebits,
    );
  });
});
