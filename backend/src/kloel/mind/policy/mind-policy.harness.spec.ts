import { MindPolicyService } from './mind-policy.service';

describe('MindPolicyService harness and outcome resolution', () => {
  describe('harness', () => {
    it('computes evaluation harness lift against baseline', async () => {
      const service = new MindPolicyService(
        {
          $executeRaw: jest.fn(),
          $queryRaw: jest.fn().mockResolvedValue([
            { outcome: 1, baselineOutcome: 0 },
            { outcome: 1, baselineOutcome: 1 },
            { outcome: 0, baselineOutcome: 0 },
          ]),
          mindPolicy: {
            findMany: jest.fn().mockResolvedValue([
              { outcome: 1, baselineOutcome: 0 },
              { outcome: 1, baselineOutcome: 1 },
              { outcome: 0, baselineOutcome: 0 },
            ]),
          },
        } as never,
        { getOrInit: jest.fn() } as never,
      );

      const result = await service.harness('ws-1', 'followup_timing', 14);

      expect(result.n).toBe(3);
      expect(result.mindMean).toBeCloseTo(2 / 3);
      expect(result.baselineMean).toBeCloseTo(1 / 3);
      expect(result.lift).toBeCloseTo(1);
    });

    it('retorna lift zero quando baselineMean e zero', async () => {
      const service = new MindPolicyService(
        {
          $executeRaw: jest.fn(),
          $queryRaw: jest.fn().mockResolvedValue([
            { outcome: 0, baselineOutcome: null },
            { outcome: 1, baselineOutcome: null },
          ]),
          mindPolicy: {
            findMany: jest.fn().mockResolvedValue([
              { outcome: 0, baselineOutcome: null },
              { outcome: 1, baselineOutcome: null },
            ]),
          },
        } as never,
        { getOrInit: jest.fn() } as never,
      );

      const result = await service.harness('ws-1', 'test', 14);

      expect(result.baselineMean).toBe(0);
      expect(result.lift).toBe(0);
    });

    it('retorna lift negativo quando MIND piora resultado', async () => {
      const service = new MindPolicyService(
        {
          $executeRaw: jest.fn(),
          $queryRaw: jest.fn().mockResolvedValue([
            { outcome: 0, baselineOutcome: 1 },
            { outcome: 0, baselineOutcome: 1 },
            { outcome: 1, baselineOutcome: 1 },
            { outcome: 0, baselineOutcome: 1 },
          ]),
          mindPolicy: {
            findMany: jest.fn().mockResolvedValue([
              { outcome: 0, baselineOutcome: 1 },
              { outcome: 0, baselineOutcome: 1 },
              { outcome: 1, baselineOutcome: 1 },
              { outcome: 0, baselineOutcome: 1 },
            ]),
          },
        } as never,
        { getOrInit: jest.fn() } as never,
      );

      const result = await service.harness('ws-1', 'test', 14);

      expect(result.n).toBe(4);
      expect(result.mindMean).toBeCloseTo(0.25);
      expect(result.baselineMean).toBeCloseTo(1);
      expect(result.lift).toBeLessThan(0);
      expect(result.lift).toBeCloseTo(-0.75);
    });
  });

  describe('resolveOpenForSubject', () => {
    it('resolves open subject policies when the real outcome arrives', async () => {
      const prisma = {
        $executeRaw: jest.fn().mockResolvedValue(2),
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'policy-1',
            workspaceId: 'ws-1',
            subject: 'contact:1',
            decisionType: 'followup_timing',
            chosen: 'short',
            baseline: 'short',
            outcomeKey: 'outcome-1',
            outcome: 1,
          },
        ]),
        kloelMemory: { upsert: jest.fn().mockResolvedValue({}) },
        mindPolicy: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'policy-1',
              workspaceId: 'ws-1',
              subject: 'contact:1',
              decisionType: 'followup_timing',
              chosen: 'short',
              baseline: 'short',
              outcomeKey: 'outcome-1',
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const service = new MindPolicyService(prisma as never, { getOrInit: jest.fn() } as never);

      const count = await service.resolveOpenForSubject({
        workspaceId: 'ws-1',
        subject: 'contact:1',
        decisionType: 'followup_timing',
        outcome: 1,
      });

      expect(count).toBe(1);
      expect(prisma.mindPolicy.findMany).toHaveBeenCalled();
      expect(prisma.mindPolicy.updateMany).toHaveBeenCalled();
      expect(prisma.kloelMemory.upsert).toHaveBeenCalled();
    });
  });
});
