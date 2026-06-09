/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { DecisionOutcomeService } from './decision-outcome.service';
import { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Covers the ADDITIVE, flag-gated decision-ledger dual-write from
 * `DecisionOutcomeService` (`RAC_DecisionOutcome`) into the parallel
 * `RAC_MindPolicy` ledger (P1-B prep).
 *
 * Contract:
 *   - flag OFF (default) → ONLY the canonical `prisma.decisionOutcome.*` write
 *     fires; `prisma.mindPolicy.*` is never touched;
 *   - flag ON            → the canonical write fires AND the mirror
 *     (`mindPolicy.findFirst` + `mindPolicy.create` on record;
 *      `mindPolicy.updateMany` on close) fires too;
 *   - the dual-write is best-effort: if the mirror rejects, the canonical
 *     write still succeeds and the error is swallowed with a warn-log.
 */
describe('DecisionOutcomeService — RAC_MindPolicy decision-ledger dual-write (KLOEL_DECISION_LEDGER_DUALWRITE)', () => {
  const originalFlag = process.env.KLOEL_DECISION_LEDGER_DUALWRITE;

  type MockPrisma = {
    decisionOutcome: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    mindPolicy: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  function buildPrisma(): MockPrisma {
    return {
      decisionOutcome: {
        create: jest.fn().mockResolvedValue({ id: 'do-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({
          contextSnapshot: { foo: 'bar' },
          decisionType: 'chat_reply',
          chosenAction: 'engage',
          workspaceId: 'ws-1',
        }),
      },
      mindPolicy: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'mp-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  function buildService(prisma: MockPrisma): DecisionOutcomeService {
    // mindBandit deliberately omitted (@Optional) so the test isolates the
    // dual-write path; the canonical write + mirror must work without it.
    return new DecisionOutcomeService(prisma as unknown as PrismaService);
  }

  const recordInput = {
    workspaceId: 'ws-1',
    decisionType: 'chat_reply',
    chosenAction: 'engage',
    baselineAction: 'silence',
    outcomeKey: 'chat:ws-1:abc',
    expectedWindow: 3600,
    contextSnapshot: { foo: 'bar' },
  };

  const closeInput = {
    outcomeKey: 'chat:ws-1:abc',
    outcomeName: 'inbound.replied',
    wonVsBaseline: true,
  };

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_DECISION_LEDGER_DUALWRITE;
    } else {
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = originalFlag;
    }
    jest.restoreAllMocks();
  });

  it('flag OFF (unset) → recordDecision writes ONLY RAC_DecisionOutcome, never touches mindPolicy', async () => {
    delete process.env.KLOEL_DECISION_LEDGER_DUALWRITE;
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.recordDecision(recordInput);

    expect(prisma.decisionOutcome.create).toHaveBeenCalledTimes(1);
    expect(prisma.mindPolicy.findFirst).not.toHaveBeenCalled();
    expect(prisma.mindPolicy.create).not.toHaveBeenCalled();
  });

  it("flag OFF (value !== 'true') → recordDecision never touches mindPolicy", async () => {
    process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'false';
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.recordDecision(recordInput);

    expect(prisma.decisionOutcome.create).toHaveBeenCalledTimes(1);
    expect(prisma.mindPolicy.create).not.toHaveBeenCalled();
  });

  it('flag OFF (unset) → closeOutcome writes ONLY RAC_DecisionOutcome, never resolves mindPolicy', async () => {
    delete process.env.KLOEL_DECISION_LEDGER_DUALWRITE;
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.closeOutcome(closeInput);

    expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.mindPolicy.updateMany).not.toHaveBeenCalled();
  });

  it('flag ON → recordDecision ALSO mirrors into RAC_MindPolicy (findFirst dedup + create)', async () => {
    process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.recordDecision(recordInput);

    // Canonical write unchanged.
    expect(prisma.decisionOutcome.create).toHaveBeenCalledTimes(1);

    // Mirror: dedup find then create.
    expect(prisma.mindPolicy.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.mindPolicy.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', outcomeKey: 'chat:ws-1:abc' },
      select: { id: true },
    });
    expect(prisma.mindPolicy.create).toHaveBeenCalledTimes(1);
    const created = prisma.mindPolicy.create.mock.calls[0][0].data;
    expect(created.workspaceId).toBe('ws-1');
    expect(created.decisionType).toBe('chat_reply');
    expect(created.chosen).toBe('engage');
    expect(created.baseline).toBe('silence');
    expect(created.outcomeKey).toBe('chat:ws-1:abc');
    expect(created.subject).toBe('chat:ws-1:abc');
    expect(created.context).toMatchObject({ foo: 'bar', source: 'decision_outcome_dualwrite' });
    expect(created.candidates).toEqual([{ action: 'engage' }, { action: 'silence' }]);
    expect(created.fallbackActive).toBe(false);
    expect(typeof created.id).toBe('string');
  });

  it('flag ON + existing mirror row → recordDecision dedups (no second create)', async () => {
    process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
    const prisma = buildPrisma();
    prisma.mindPolicy.findFirst.mockResolvedValue({ id: 'existing-mp' });
    const service = buildService(prisma);

    await service.recordDecision(recordInput);

    expect(prisma.mindPolicy.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.mindPolicy.create).not.toHaveBeenCalled();
  });

  it('flag ON → closeOutcome ALSO resolves the mirrored RAC_MindPolicy row', async () => {
    process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.closeOutcome(closeInput);

    expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.mindPolicy.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.mindPolicy.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      workspaceId: 'ws-1',
      outcomeKey: 'chat:ws-1:abc',
      resolvedAt: null,
    });
    expect(call.data.outcome).toBe(1);
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
  });

  it('flag ON + mirror create throws → canonical recordDecision still succeeds, error swallowed + warn-logged', async () => {
    process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
    const prisma = buildPrisma();
    prisma.mindPolicy.create.mockRejectedValue(new Error('mindPolicy down'));
    const warnSpy = jest
      .spyOn(StructuredLogger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = buildService(prisma);

    await expect(service.recordDecision(recordInput)).resolves.toBeUndefined();

    expect(prisma.decisionOutcome.create).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('MindPolicy')),
    ).toBe(true);
  });

  it('flag ON + mirror updateMany throws → canonical closeOutcome still succeeds, error swallowed', async () => {
    process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
    const prisma = buildPrisma();
    prisma.mindPolicy.updateMany.mockRejectedValue(new Error('mindPolicy resolve down'));
    const warnSpy = jest
      .spyOn(StructuredLogger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = buildService(prisma);

    await expect(service.closeOutcome(closeInput)).resolves.toBeUndefined();

    expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});
