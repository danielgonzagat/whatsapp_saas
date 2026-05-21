import { MindBeliefService } from './mind-belief.service';
import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindPolicyService } from './mind-policy.service';
import { MindWorkspaceStateService } from './mind-workspace-state.service';

describe('MIND cross-workspace isolation', () => {
  it('mantem crencas escopadas por workspace', async () => {
    const prisma = {
      mindBelief: {
        findMany: jest.fn(({ where }: { where: { workspaceId: string } }) =>
          Promise.resolve(
            where.workspaceId === 'ws-A'
              ? [{ id: 'belief-A', workspaceId: 'ws-A', samples: 3 }]
              : [{ id: 'belief-B', workspaceId: 'ws-B', samples: 7 }],
          ),
        ),
      },
    };
    const service = new MindBeliefService(prisma as never);

    const resultA = await service.list('ws-A', 'P(reply)');
    const resultB = await service.list('ws-B', 'P(reply)');

    expect(resultA).toEqual([expect.objectContaining({ id: 'belief-A', workspaceId: 'ws-A' })]);
    expect(resultB).toEqual([expect.objectContaining({ id: 'belief-B', workspaceId: 'ws-B' })]);
    expect(prisma.mindBelief.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-A' }) }),
    );
    expect(prisma.mindBelief.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-B' }) }),
    );
  });

  it('mantem memoria vetorial de casos escopada por workspace', async () => {
    const prisma = {
      mindCase: {
        findMany: jest.fn(({ where }: { where: { workspaceId: string } }) =>
          Promise.resolve([
            {
              id: `case-${where.workspaceId}`,
              workspaceId: where.workspaceId,
              caseType: 'price_objection',
              tokens: ['preco', where.workspaceId],
              features: { channel: 'whatsapp' },
              outcome: 1,
              occurredAt: new Date('2026-05-10T12:00:00.000Z'),
            },
          ]),
        ),
      },
    };
    const service = new MindCaseMemoryService(prisma as never);

    const resultA = await service.similar({
      workspaceId: 'ws-A',
      caseType: 'price_objection',
      text: 'preco',
      features: { channel: 'whatsapp' },
    });
    const resultB = await service.similar({
      workspaceId: 'ws-B',
      caseType: 'price_objection',
      text: 'preco',
      features: { channel: 'whatsapp' },
    });

    expect(resultA).toHaveLength(1);
    expect(resultB).toHaveLength(1);
    expect(resultA[0].workspaceId).toBe('ws-A');
    expect(resultB[0].workspaceId).toBe('ws-B');
    expect(prisma.mindCase.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-A' }) }),
    );
    expect(prisma.mindCase.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-B' }) }),
    );
  });

  it('calcula lift apenas com policies do workspace consultado', async () => {
    const prisma = {
      mindPolicy: {
        findMany: jest.fn(({ where }: { where: { workspaceId: string } }) =>
          Promise.resolve(
            where.workspaceId === 'ws-A'
              ? [
                  { outcome: 1, baselineOutcome: 0 },
                  { outcome: 1, baselineOutcome: 0 },
                ]
              : [
                  { outcome: 0, baselineOutcome: 1 },
                  { outcome: 0, baselineOutcome: 1 },
                ],
          ),
        ),
      },
    };
    const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

    const resultA = await service.harness('ws-A', 'followup_timing');
    const resultB = await service.harness('ws-B', 'followup_timing');

    expect(resultA.lift).toBe(0);
    expect(resultA.mindMean).toBe(1);
    expect(resultA.baselineMean).toBe(0);
    expect(resultB.lift).toBe(-1);
    expect(prisma.mindPolicy.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-A' }) }),
    );
    expect(prisma.mindPolicy.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-B' }) }),
    );
  });

  it('resolve outcomes abertos somente para o workspace alvo', async () => {
    const prisma = {
      kloelMemory: { upsert: jest.fn().mockResolvedValue(undefined) },
      mindPolicy: {
        findMany: jest.fn(({ where }: { where: { workspaceId: string } }) =>
          Promise.resolve([
            {
              id: `policy-${where.workspaceId}`,
              workspaceId: where.workspaceId,
              subject: 'contact:1',
              decisionType: 'coupon_offer',
              context: { channel: 'whatsapp' },
              chosen: 'coupon_10',
              baseline: 'no_coupon',
              outcomeKey: null,
            },
          ]),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

    const count = await service.resolveOpenForSubject({
      workspaceId: 'ws-A',
      subject: 'contact:1',
      decisionType: 'coupon_offer',
      outcome: 1,
    });

    expect(count).toBe(1);
    expect(prisma.mindPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'ws-A', subject: 'contact:1' }),
      }),
    );
    expect(prisma.mindPolicy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'policy-ws-A', workspaceId: 'ws-A' }),
      }),
    );
  });

  it('mantem lease, watermark e tick state por workspace', async () => {
    const prisma = {
      mindWorkspaceState: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ lastWatermark: new Date('2026-05-10T10:00:00.000Z') }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new MindWorkspaceStateService(prisma as never);

    const watermark = await service.watermark('ws-A', new Date('2026-05-01T00:00:00.000Z'));
    await service.releaseTickLease('ws-A', 'owner-1');
    await service.recordSuccess({
      lastWatermark: watermark,
      tick: {
        workspaceId: 'ws-A',
        beliefsUpdated: 1,
        perceived: 2,
        predicted: 1,
        resolved: 1,
        surpriseTotal: 0.25,
        decisionsMade: 3,
        durationMs: 14,
      },
    });

    expect(watermark.toISOString()).toBe('2026-05-10T10:00:00.000Z');
    expect(prisma.mindWorkspaceState.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-A' } }),
    );
    expect(prisma.mindWorkspaceState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-A', tickLeaseOwner: 'owner-1' } }),
    );
    expect(prisma.mindWorkspaceState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-A' },
        create: expect.objectContaining({ workspaceId: 'ws-A' }),
      }),
    );
  });
});
