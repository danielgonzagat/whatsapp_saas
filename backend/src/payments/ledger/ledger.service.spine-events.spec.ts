import { Test, type TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { SpineEmitterService } from '../../kloel/spine/spine-emitter.service';
import type { SpineEventEnvelope, SpineEventInput } from '../../kloel/spine/spine-event.types';

import { LedgerService } from './ledger.service';
import { makeBalance, makePrismaStub } from './ledger.service.spec-helpers';

/**
 * Spine-event emission spec for LedgerService.
 *
 * The money-move methods publish canonical commerce.payment.* spine events
 * AFTER the ledger $transaction commits, so downstream cognitive consumers
 * (analytics, autopilot, brain/mind) observe payment state changes. The
 * emission is fire-and-forget and must never alter ledger amounts, balances,
 * or idempotency — these tests assert the event fires on a genuine write and
 * does NOT re-fire on an idempotent replay.
 */

type SpineSpy = {
  emit: jest.Mock<Promise<SpineEventEnvelope>, [SpineEventInput]>;
};

async function buildWithSpine(
  stub: ReturnType<typeof makePrismaStub>,
): Promise<{ service: LedgerService; spine: SpineSpy }> {
  const spine: SpineSpy = {
    emit: jest
      .fn<Promise<SpineEventEnvelope>, [SpineEventInput]>()
      .mockResolvedValue(undefined as unknown as SpineEventEnvelope),
  };
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      LedgerService,
      { provide: PrismaService, useValue: stub.prisma },
      { provide: SpineEmitterService, useValue: spine },
    ],
  }).compile();
  return { service: moduleRef.get(LedgerService), spine };
}

/** Typed accessor for the first .emit() call argument — keeps assertions off `any`. */
function firstEmitArg(spine: SpineSpy): SpineEventInput {
  const call = spine.emit.mock.calls[0];
  if (!call) {
    throw new Error('spine.emit was not called');
  }
  return call[0];
}

describe('LedgerService spine event emission', () => {
  it('emits commerce.payment.approved after a successful creditPending', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const { service, spine } = await buildWithSpine(stub);

    const entry = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 13_990n,
      matureAt: new Date('2026-05-17T00:00:00Z'),
      reference: { type: 'sale', id: 'pi_1' },
    });

    expect(spine.emit).toHaveBeenCalledTimes(1);
    const arg = firstEmitArg(spine);
    expect(arg.eventName).toBe('commerce.payment.approved');
    expect(arg.workspaceId).toBe('ws_1');
    expect(arg.truthMode).toBe('observed');
    expect(arg.provenance.source).toBe('production');
    expect(arg.entityRef).toEqual({ entityType: 'ledger_entry', entityId: entry.id });
    // cents are stringified bigint — never a float
    expect(arg.payload?.['amountCents']).toBe('13990');
    expect(arg.payload?.['phase']).toBe('credit_pending');
    // emission must not have mutated the persisted entry
    expect(entry.type).toBe('CREDIT_PENDING');
    expect(entry.amountCents).toBe(13_990n);
  });

  it('does NOT re-emit on an idempotent creditPending replay', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const { service, spine } = await buildWithSpine(stub);

    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_dup' },
    });
    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_dup' },
    });

    // first call fires once; replay is an idempotent no-op → still 1
    expect(spine.emit).toHaveBeenCalledTimes(1);
  });

  it('emits commerce.payment.refunded after a successful debitForRefund', async () => {
    const stub = makePrismaStub([makeBalance({ pendingBalanceCents: 5_000n })]);
    const { service, spine } = await buildWithSpine(stub);

    const entry = await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 2_000n,
      reference: { type: 'refund', id: 're_1' },
    });

    expect(spine.emit).toHaveBeenCalledTimes(1);
    const arg = firstEmitArg(spine);
    expect(arg.eventName).toBe('commerce.payment.refunded');
    expect(arg.workspaceId).toBe('ws_1');
    expect(arg.payload?.['amountCents']).toBe('2000');
    expect(arg.entityRef).toEqual({ entityType: 'ledger_entry', entityId: entry.id });
    expect(entry.type).toBe('DEBIT_REFUND');
  });

  it('emits commerce.payment.charged_back after a successful debitForChargeback', async () => {
    const stub = makePrismaStub([makeBalance({ pendingBalanceCents: 5_000n })]);
    const { service, spine } = await buildWithSpine(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 1_500n,
      reference: { type: 'chargeback', id: 'cb_1' },
    });

    expect(spine.emit).toHaveBeenCalledTimes(1);
    expect(firstEmitArg(spine).eventName).toBe('commerce.payment.charged_back');
  });

  it('emits commerce.payment.approved after maturation (moveFromPendingToAvailable)', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const { service, spine } = await buildWithSpine(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_mature' },
    });
    spine.emit.mockClear();

    await service.moveFromPendingToAvailable(credit.id);

    expect(spine.emit).toHaveBeenCalledTimes(1);
    const arg = firstEmitArg(spine);
    expect(arg.eventName).toBe('commerce.payment.approved');
    expect(arg.payload?.['phase']).toBe('matured');
  });

  it('does NOT re-emit on an idempotent maturation replay', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const { service, spine } = await buildWithSpine(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 700n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_idem_mat' },
    });
    await service.moveFromPendingToAvailable(credit.id);
    spine.emit.mockClear();

    await service.moveFromPendingToAvailable(credit.id);

    expect(spine.emit).not.toHaveBeenCalled();
  });

  it('is a safe no-op when no spine is injected (money path unaffected)', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [LedgerService, { provide: PrismaService, useValue: stub.prisma }],
    }).compile();
    const service = moduleRef.get(LedgerService);

    const entry = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 4_200n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_no_spine' },
    });

    expect(entry.type).toBe('CREDIT_PENDING');
    expect(entry.amountCents).toBe(4_200n);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(4_200n);
  });

  it('swallows a spine emit rejection — the money path still resolves', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const { service, spine } = await buildWithSpine(stub);
    spine.emit.mockRejectedValue(new Error('spine down'));

    const entry = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 9_900n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_emit_fail' },
    });

    // the ledger write committed even though the fire-and-forget emit rejected
    expect(entry.type).toBe('CREDIT_PENDING');
    expect(entry.amountCents).toBe(9_900n);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(9_900n);
    expect(spine.emit).toHaveBeenCalledTimes(1);
    // let the rejected emit promise settle so its .catch runs before teardown
    await Promise.resolve();
  });
});
