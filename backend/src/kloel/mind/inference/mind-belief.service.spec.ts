import { MindBeliefService } from './mind-belief.service';

function mockGlobalPrior() {
  return { lookupPrior: jest.fn().mockResolvedValue(null) };
}

describe('MindBeliefService', () => {
  describe('getOrInit', () => {
    it('creates a new belief when none exists (no prior)', async () => {
      const created = {
        id: 'belief-new',
        workspaceId: 'ws-1',
        subject: 'contact:new',
        predicate: 'P(reply)',
        context: { channel: 'sms' },
        mean: 0.5,
        variance: 1 / 12,
        samples: 0,
        alpha: 1,
        beta: 1,
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([created]),
        mindBelief: {
          findFirst: jest.fn(),
          create: jest.fn().mockResolvedValue(created),
          update: jest.fn(),
          findMany: jest.fn(),
        },
      };
      const service = new MindBeliefService(prisma as never, mockGlobalPrior() as never);

      const result = await service.getOrInit('ws-1', 'contact:new', 'P(reply)', {
        channel: 'sms',
      });

      expect(result.id).toBe('belief-new');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.mindBelief.findFirst).not.toHaveBeenCalled();
    });

    it('creates a new belief with non-uniform alpha/beta when global prior exists', async () => {
      const created = {
        id: 'belief-prior',
        workspaceId: 'ws-1',
        subject: 'contact:returning',
        predicate: 'P(reply)',
        context: { channel: 'email' },
        mean: 7 / 10,
        variance: 0.01,
        samples: 0,
        alpha: 7,
        beta: 3,
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([created]),
        mindBelief: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          findMany: jest.fn(),
        },
      };
      const globalPrior = {
        lookupPrior: jest.fn().mockResolvedValue({ alpha: 7, beta: 3 }),
      };
      const service = new MindBeliefService(prisma as never, globalPrior as never);

      const result = await service.getOrInit('ws-1', 'contact:returning', 'P(reply)', {
        channel: 'email',
      });

      expect(result.id).toBe('belief-prior');
      expect(result.alpha).toBe(7);
      expect(result.beta).toBe(3);
      expect(globalPrior.lookupPrior).toHaveBeenCalledWith('contact:returning', 'P(reply)', {
        channel: 'email',
      });
    });

    it('falls back to findFirst when another insert wins the race', async () => {
      const existing = {
        id: 'belief-existing',
        workspaceId: 'ws-1',
        subject: 'contact:1',
        predicate: 'P(reply)',
        context: { channel: 'sms' },
        mean: 0.5,
        variance: 1 / 12,
        samples: 0,
        alpha: 1,
        beta: 1,
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        mindBelief: {
          findFirst: jest.fn().mockResolvedValue(existing),
          create: jest.fn(),
          update: jest.fn(),
          findMany: jest.fn(),
        },
      };
      const service = new MindBeliefService(prisma as never, mockGlobalPrior() as never);

      const result = await service.getOrInit('ws-1', 'contact:1', 'P(reply)', {
        channel: 'sms',
      });

      expect(result.id).toBe('belief-existing');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.mindBelief.create).not.toHaveBeenCalled();
      expect(prisma.mindBelief.findFirst).toHaveBeenCalled();
    });

    it('returns existing belief even when prior exists (prior skipped for existing)', async () => {
      const existing = {
        id: 'belief-existing',
        workspaceId: 'ws-1',
        subject: 'contact:1',
        predicate: 'P(reply)',
        context: { channel: 'sms' },
        mean: 0.6,
        variance: 0.04,
        samples: 10,
        alpha: 6,
        beta: 4,
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        mindBelief: {
          findFirst: jest.fn().mockResolvedValue(existing),
          create: jest.fn(),
          update: jest.fn(),
          findMany: jest.fn(),
        },
      };
      const globalPrior = {
        lookupPrior: jest.fn().mockResolvedValue({ alpha: 7, beta: 3 }),
      };
      const service = new MindBeliefService(prisma as never, globalPrior as never);

      const result = await service.getOrInit('ws-1', 'contact:1', 'P(reply)', {
        channel: 'sms',
      });

      expect(result.id).toBe('belief-existing');
      expect(result.alpha).toBe(6);
      expect(result.beta).toBe(4);
      expect(globalPrior.lookupPrior).toHaveBeenCalled();
      expect(prisma.mindBelief.findFirst).toHaveBeenCalled();
    });

    it('throws when the insert and follow-up lookup both fail to return a row', async () => {
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        mindBelief: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
          findMany: jest.fn(),
        },
      };
      const service = new MindBeliefService(prisma as never, mockGlobalPrior() as never);

      await expect(service.getOrInit('ws-1', 'c:1', 'P(x)', {})).rejects.toThrow(
        'mind_belief_get_or_init_failed',
      );
    });
  });

  describe('observeBinary', () => {
    it('updates binary beliefs with exact beta posterior math', async () => {
      const existing = {
        id: 'belief-1',
        workspaceId: 'ws-1',
        subject: 'contact:1',
        predicate: 'P(reply|template,hour,channel)',
        context: { template: 'audio', hour: 20 },
        mean: 0.5,
        variance: 1 / 12,
        samples: 0,
        alpha: 1,
        beta: 1,
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([existing]),
        $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            $queryRaw: jest.fn().mockResolvedValue([existing]),
            mindBelief: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findFirstOrThrow: jest.fn().mockResolvedValue({
                ...existing,
                alpha: 2,
                beta: 1,
                mean: 2 / 3,
                variance: (2 * 1) / (3 * 3 * 4),
                samples: 1,
              }),
            },
          }),
        ),
        mindBelief: {
          findFirst: jest.fn(),
          create: jest.fn().mockResolvedValue(existing),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findFirstOrThrow: jest.fn().mockResolvedValue({
            ...existing,
            alpha: 2,
            beta: 1,
            mean: 2 / 3,
            variance: (2 * 1) / (3 * 3 * 4),
            samples: 1,
          }),
          findMany: jest.fn(),
        },
      };
      const service = new MindBeliefService(prisma as never, mockGlobalPrior() as never);

      const belief = await service.observeBinary(
        'ws-1',
        'contact:1',
        'P(reply|template,hour,channel)',
        { template: 'audio', hour: 20 },
        1,
      );

      expect(belief.alpha).toBe(2);
      expect(belief.beta).toBe(1);
      expect(belief.mean).toBeCloseTo(2 / 3);
      expect(belief.variance).toBeCloseTo((2 * 1) / (3 * 3 * 4));
      expect(belief.samples).toBe(1);
    });

    it('increments beta on outcome 0', async () => {
      const existing = {
        id: 'belief-2',
        workspaceId: 'ws-1',
        subject: 'contact:2',
        predicate: 'P(reply)',
        context: {},
        mean: 0.7,
        variance: 0.04,
        samples: 10,
        alpha: 7,
        beta: 3,
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([existing]),
        $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            $queryRaw: jest.fn().mockResolvedValue([existing]),
            mindBelief: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findFirstOrThrow: jest.fn().mockResolvedValue({
                ...existing,
                beta: 4,
                mean: 7 / 11,
                samples: 11,
              }),
            },
          }),
        ),
        mindBelief: {
          findFirst: jest.fn(),
          create: jest.fn().mockResolvedValue(existing),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findFirstOrThrow: jest.fn().mockResolvedValue({
            ...existing,
            beta: 4,
            mean: 7 / 11,
            samples: 11,
          }),
          findMany: jest.fn(),
        },
      };
      const service = new MindBeliefService(prisma as never, mockGlobalPrior() as never);

      const belief = await service.observeBinary('ws-1', 'contact:2', 'P(reply)', {}, 0);

      expect(belief.alpha).toBe(7);
      expect(belief.beta).toBe(4);
      expect(belief.mean).toBeCloseTo(7 / 11);
      expect(belief.samples).toBe(11);
    });
  });
});
