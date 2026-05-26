import { MindPolicyService } from './mind-policy.service';

type MindPolicyUpdateManyArgs = {
  where: { id: string; workspaceId: string; resolvedAt: null };
  data: { outcome: number; resolvedAt: Date; baselineOutcome: number };
};

describe('MindPolicyService outcomes', () => {
  const buildPrisma = (
    harnessRows: Array<{ outcome: number; baselineOutcome: number | null }> = [],
  ) => ({
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue(harnessRows),
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ globalPriorOptOut: false }),
    },
    mindPolicy: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          harnessRows.map((r) => ({ outcome: r.outcome, baselineOutcome: r.baselineOutcome })),
        ),
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
  });

  describe('resolve outcomes with real baseline', () => {
    it('estima baseline contrafactual quando o caller nao informa baselineOutcome', async () => {
      const updateMany = jest
        .fn<Promise<{ count: number }>, [MindPolicyUpdateManyArgs]>()
        .mockResolvedValue({ count: 1 });
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-1',
              workspaceId: 'ws-1',
              subject: 'contact:1',
              decisionType: 'coupon_offer',
              context: { channel: 'whatsapp', ticket: 0.2 },
              chosen: 'coupon_15',
              baseline: 'no_coupon',
              outcomeKey: 'coupon:1',
            },
          ]),
          updateMany,
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

      await service.resolveOutcome('ws-1', 'coupon:1', 1);

      expect(updateMany).toHaveBeenCalledTimes(1);
      const updateCall = updateMany.mock.calls[0]?.[0];
      if (updateCall === undefined) {
        throw new Error('Expected mindPolicy.updateMany to be called');
      }
      expect(updateCall.where).toEqual({
        id: 'policy-1',
        workspaceId: 'ws-1',
        resolvedAt: null,
      });
      expect(updateCall.data.outcome).toBe(1);
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
      expect(updateCall.data.baselineOutcome).toBeGreaterThanOrEqual(0);
      expect(updateCall.data.baselineOutcome).toBeLessThan(1);
    });

    it('calcula lift diferente de zero quando baselineOutcome diverge do outcome', async () => {
      const prisma = buildPrisma([
        { outcome: 1, baselineOutcome: 0.65 },
        { outcome: 1, baselineOutcome: 0.65 },
        { outcome: 0, baselineOutcome: 0.35 },
      ]);
      const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

      const result = await service.harness('ws-1', 'coupon_offer');

      expect(result.mindMean).toBeCloseTo(2 / 3);
      expect(result.baselineMean).toBeCloseTo(0.55);
      expect(result.lift).toBeGreaterThan(0);
    });

    it('resolveOutcome: records global prior observation when globalPrior is injected', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-1',
              workspaceId: 'ws-1',
              subject: 'contact:1',
              decisionType: 'coupon_offer',
              context: { channel: 'whatsapp', ticket: 0.2 },
              chosen: 'coupon_15',
              baseline: 'no_coupon',
              outcomeKey: 'coupon:1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      await service.resolveOutcome('ws-1', 'coupon:1', 1);

      expect(recordObservation).toHaveBeenCalledTimes(1);
      expect(recordObservation).toHaveBeenCalledWith('whatsapp', 'coupon_offer', 'coupon_15', true);
    });

    it('resolveOutcome: records failure when outcome is below threshold', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-2',
              workspaceId: 'ws-1',
              subject: 'contact:2',
              decisionType: 'tom',
              context: { channel: 'whatsapp' },
              chosen: 'AGGRESSIVE',
              baseline: 'FRIENDLY',
              outcomeKey: 'tom:1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      await service.resolveOutcome('ws-1', 'tom:1', 0);

      expect(recordObservation).toHaveBeenCalledWith('whatsapp', 'tom', 'AGGRESSIVE', false);
    });

    it('resolveOutcome: succeeds even when recordObservation throws', async () => {
      const recordObservation = jest.fn().mockRejectedValue(new Error('DB down'));
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        kloelMemory: { upsert: jest.fn() },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-3',
              workspaceId: 'ws-1',
              subject: 'contact:3',
              decisionType: 'followup_timing',
              context: { channel: 'whatsapp' },
              chosen: 'exploit_text_10h',
              baseline: 'short',
              outcomeKey: 'followup:1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
        mindPolicy: { create: jest.fn(), findMany: jest.fn() },
      };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      await expect(service.resolveOutcome('ws-1', 'followup:1', 1)).resolves.toBeUndefined();

      expect(tx.mindPolicy.updateMany).toHaveBeenCalled();
      expect(recordObservation).toHaveBeenCalled();
    });

    it('resolveOpenForSubject: records global prior observations for resolved rows', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const mindPolicy = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-1',
            workspaceId: 'ws-1',
            subject: 'contact:10',
            decisionType: 'followup_timing',
            context: { channel: 'instagram' },
            chosen: 'exploit_text_10h',
            baseline: 'short',
            outcomeKey: 'outcome:1',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const prisma = { mindPolicy, kloelMemory: { upsert: jest.fn() } };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      const count = await service.resolveOpenForSubject({
        workspaceId: 'ws-1',
        subject: 'contact:10',
        decisionType: 'followup_timing',
        outcome: 1,
      });

      expect(count).toBe(1);
      expect(recordObservation).toHaveBeenCalledTimes(1);
      expect(recordObservation).toHaveBeenCalledWith(
        'instagram',
        'followup_timing',
        'exploit_text_10h',
        true,
      );
    });

    it('resolveOpenForSubject: skips prior when channel is absent from context', async () => {
      const recordObservation = jest.fn().mockResolvedValue(undefined);
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const mindPolicy = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-2',
            workspaceId: 'ws-1',
            subject: 'contact:11',
            decisionType: 'followup_timing',
            context: {},
            chosen: 'exploit_text_10h',
            baseline: 'short',
            outcomeKey: 'outcome:2',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const prisma = { mindPolicy, kloelMemory: { upsert: jest.fn() } };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      await service.resolveOpenForSubject({
        workspaceId: 'ws-1',
        subject: 'contact:11',
        decisionType: 'followup_timing',
        outcome: 1,
      });

      expect(recordObservation).not.toHaveBeenCalled();
    });

    it('resolveOpenForSubject: succeeds even when recordObservation throws', async () => {
      const recordObservation = jest.fn().mockRejectedValue(new Error('DB down'));
      const globalPrior = { recordObservation, getPrior: jest.fn() };

      const mindPolicy = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-3',
            workspaceId: 'ws-1',
            subject: 'contact:12',
            decisionType: 'followup_timing',
            context: { channel: 'whatsapp' },
            chosen: 'short',
            baseline: 'short',
            outcomeKey: 'outcome:3',
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const prisma = { mindPolicy, kloelMemory: { upsert: jest.fn() } };
      const service = new MindPolicyService(
        prisma as never,
        { getOrInit: jest.fn() } as never,
        globalPrior as never,
      );

      const count = await service.resolveOpenForSubject({
        workspaceId: 'ws-1',
        subject: 'contact:12',
        decisionType: 'followup_timing',
        outcome: 1,
      });

      expect(count).toBe(1);
      expect(recordObservation).toHaveBeenCalled();
    });
  });
});
