import type { Logger } from '@nestjs/common';

import type { LedgerService } from './ledger.service';
import { buildService, makeBalance, makePrismaStub } from './ledger.service.spec-helpers';

/**
 * LedgerService spec — structured audit log emission.
 *
 * Asserts that every state-mutating ledger call publishes a structured
 * `connect_ledger_write` log entry with the operation-specific fields the
 * downstream observability pipeline expects.
 *
 * The service exposes its `Logger` as a private member (proper
 * encapsulation). To spy on it without weakening the production type we
 * use `Reflect.get`, which returns `any` from the runtime API so a single
 * `as Logger` cast suffices — no double cast needed.
 */
const getLogger = (service: LedgerService): Logger => Reflect.get(service, 'logger') as Logger;

// PULSE_OK: assertions exist below
describe('LedgerService — audit logging', () => {
  it('emits structured log event for creditPending', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn(getLogger(service), 'log');

    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'creditPending',
        accountBalanceId: 'cab_seller',
        workspaceId: 'ws_1',
        amountCents: '1000',
      }),
    );
  });

  it('emits structured log event for mature', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);
    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_mat_audit' },
    });
    const logSpy = jest.spyOn(getLogger(service), 'log');

    await service.moveFromPendingToAvailable(credit.id);

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'mature',
        promotedFromEntryId: credit.id,
      }),
    );
  });

  it('emits structured log event for debitPayout', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 2_000n })]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn(getLogger(service), 'log');

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 700n,
      reference: { type: 'payout', id: 'po_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'debitPayout',
        amountCents: '700',
      }),
    );
  });

  it('emits structured log event for debitChargeback', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 500n, availableBalanceCents: 500n }),
    ]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn(getLogger(service), 'log');

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 700n,
      reference: { type: 'dispute', id: 'dp_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'debitChargeback',
        absorbedFromPendingCents: '500',
        absorbedFromAvailableCents: '200',
      }),
    );
  });

  it('emits structured log event for debitRefund', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 200n, availableBalanceCents: 300n }),
    ]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn(getLogger(service), 'log');

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 400n,
      reference: { type: 'refund', id: 're_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'debitRefund',
        absorbedFromPendingCents: '200',
        absorbedFromAvailableCents: '200',
      }),
    );
  });

  it('emits structured log event for adjustment', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 100n, lifetimePaidOutCents: 500n }),
    ]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn(getLogger(service), 'log');

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 200n,
      reference: { type: 'adjustment', id: 'adj_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'adjustment',
        amountCents: '200',
      }),
    );
  });
});
