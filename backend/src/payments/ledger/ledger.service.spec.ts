import { AccountBalanceNotFoundError, InsufficientAvailableBalanceError } from './ledger.types';
import { buildService, makeBalance, makePrismaStub } from './ledger.service.spec-helpers';

/**
 * Unit spec for LedgerService — core posting operations.
 *
 * Strategy: in-memory PrismaService stub. The stub mirrors the real Prisma
 * surface used by the service (connectLedgerEntry.findFirst/findUnique/create/update
 * + connectAccountBalance.findUnique/update + $transaction). $transaction
 * passes the same stub through, so the service code paths are exercised end-
 * to-end inside a single test process without spinning up Postgres.
 *
 * What we are NOT testing here:
 *  - The actual SERIALIZABLE / FOR UPDATE row-locking semantics — those are
 *    Prisma + Postgres concerns. We test that the service issues balance
 *    updates inside `$transaction`; locking correctness comes from the
 *    transaction isolation level configured on the real client.
 *  - SQL constraint enforcement (the @@unique on (reference_type,
 *    reference_id, type) is a defence-in-depth layer; the service-level
 *    findFirst() check is the application-level idempotency guard tested
 *    here.
 *
 * Sibling spec files cover:
 *  - debits (chargeback / refund / adjustment) → ledger.service.debits.spec.ts
 *  - error paths → ledger.service.error-paths.spec.ts
 *  - audit logging → ledger.service.audit-logging.spec.ts
 *  - invariants and concurrency → ledger.service.invariants.spec.ts
 */

describe('LedgerService.creditPending', () => {
  it('appends CREDIT_PENDING and bumps pendingBalance + lifetimeReceived', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const entry = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 13_990n,
      matureAt: new Date('2026-05-17T00:00:00Z'),
      reference: { type: 'sale', id: 'pi_1' },
    });

    expect(entry.type).toBe('CREDIT_PENDING');
    expect(entry.amountCents).toBe(13_990n);
    expect(entry.matured).toBe(false);
    expect(entry.scheduledFor).toEqual(new Date('2026-05-17T00:00:00Z'));

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(13_990n);
    expect(balance?.availableBalanceCents).toBe(0n);
    expect(balance?.lifetimeReceivedCents).toBe(13_990n);
  });

  it('is idempotent on (reference.type, reference.id, CREDIT_PENDING)', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const first = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_dup' },
    });
    const second = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_dup' },
    });

    expect(second.id).toBe(first.id);
    expect(stub.entries.filter((e) => e.type === 'CREDIT_PENDING')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(1_000n);
  });

  it('rejects non-positive amountCents', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.creditPending({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        matureAt: new Date(),
        reference: { type: 'sale', id: 'pi_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('throws AccountBalanceNotFoundError for unknown account', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.creditPending({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        matureAt: new Date(),
        reference: { type: 'sale', id: 'pi_x' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });
});

describe('LedgerService.moveFromPendingToAvailable', () => {
  it('shifts cents from pending → available, marks original entry matured, appends MATURE', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_1' },
    });

    await service.moveFromPendingToAvailable(credit.id);

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(5_000n);

    const updatedCredit = stub.entries.find((e) => e.id === credit.id);
    expect(updatedCredit?.matured).toBe(true);

    const matureEntry = stub.entries.find((e) => e.type === 'MATURE');
    expect(matureEntry?.amountCents).toBe(5_000n);
    expect(matureEntry?.balanceAfterAvailableCents).toBe(5_000n);
  });

  it('is idempotent on the entry id (second call no-ops once matured)', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 700n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_idem' },
    });

    await service.moveFromPendingToAvailable(credit.id);
    await service.moveFromPendingToAvailable(credit.id);

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(700n);
    expect(stub.entries.filter((e) => e.type === 'MATURE')).toHaveLength(1);
  });

  it('rejects when the referenced entry is not CREDIT_PENDING', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 1_000n })]);
    const service = await buildService(stub);

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'payout', id: 'po_1' },
    });
    const debitEntry = stub.entries.find((e) => e.type === 'DEBIT_PAYOUT');

    await expect(service.moveFromPendingToAvailable(debitEntry.id)).rejects.toThrow(
      /not CREDIT_PENDING/,
    );
  });
});

describe('LedgerService.debitAvailableForPayout', () => {
  it('debits AVAILABLE and increments lifetimePaidOut', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 9_010n })]);
    const service = await buildService(stub);

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      reference: { type: 'payout', id: 'po_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(4_010n);
    expect(balance?.lifetimePaidOutCents).toBe(5_000n);
  });

  it('throws InsufficientAvailableBalanceError when amount exceeds available', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 100n })]);
    const service = await buildService(stub);

    await expect(
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 200n,
        reference: { type: 'payout', id: 'po_short' },
      }),
    ).rejects.toBeInstanceOf(InsufficientAvailableBalanceError);
  });

  it('is idempotent on (reference, DEBIT_PAYOUT)', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 1_000n })]);
    const service = await buildService(stub);

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 400n,
      reference: { type: 'payout', id: 'po_idem' },
    });
    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 400n,
      reference: { type: 'payout', id: 'po_idem' },
    });

    expect(stub.balances.get('cab_seller')?.availableBalanceCents).toBe(600n);
    expect(stub.entries.filter((e) => e.type === 'DEBIT_PAYOUT')).toHaveLength(1);
  });
});

describe('LedgerService.getBalance', () => {
  it('returns a snapshot of all balance fields', async () => {
    const stub = makePrismaStub([
      makeBalance({
        pendingBalanceCents: 100n,
        availableBalanceCents: 200n,
        lifetimeReceivedCents: 500n,
        lifetimePaidOutCents: 200n,
        lifetimeChargebacksCents: 0n,
      }),
    ]);
    const service = await buildService(stub);

    const snap = await service.getBalance('cab_seller');
    expect(snap).toEqual({
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      accountType: 'SELLER',
      pendingCents: 100n,
      availableCents: 200n,
      lifetimeReceivedCents: 500n,
      lifetimePaidOutCents: 200n,
      lifetimeChargebacksCents: 0n,
    });
  });

  it('throws AccountBalanceNotFoundError for unknown id', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);
    await expect(service.getBalance('cab_missing')).rejects.toBeInstanceOf(
      AccountBalanceNotFoundError,
    );
  });
});
