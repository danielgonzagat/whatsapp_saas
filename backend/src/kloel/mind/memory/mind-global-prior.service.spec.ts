import { MindGlobalPriorService } from './mind-global-prior.service';
import { partialMatch } from '../../../../test/helpers/match-instance';

describe('MindGlobalPriorService', () => {
  describe('getPriorTuple', () => {
    it('returns null when no arms exist for the action', async () => {
      const prisma = {
        mindGlobalPrior: { findFirst: jest.fn() },
        workspace: { findMany: jest.fn() },
        mindBanditArm: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.getPriorTuple('whatsapp', 'followup', 'send_audio');

      expect(result).toBeNull();
      expect(prisma.mindBanditArm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { decisionType: 'followup', arm: 'send_audio', pulls: { gt: 0 } },
        }),
      );
    });

    it('aggregates alpha/beta from multiple workspace arms and returns Beta-posterior mean', async () => {
      const prisma = {
        mindGlobalPrior: { findFirst: jest.fn() },
        workspace: { findMany: jest.fn() },
        mindBanditArm: {
          findMany: jest.fn().mockResolvedValue([
            { alpha: 9, beta: 3, pulls: 12 },
            { alpha: 5, beta: 5, pulls: 10 },
          ]),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.getPriorTuple('whatsapp', 'offer', 'offer_a');

      expect(result).not.toBeNull();
      // totalAlpha = 1 + 9 + 5 = 15, totalBeta = 1 + 3 + 5 = 9 → mean = 15/24 ≈ 0.625
      expect(result!.mean).toBeCloseTo(15 / 24, 5);
      expect(result!.observations).toBe(22);
    });

    it('returns correct observations as sum of pulls across workspaces', async () => {
      const prisma = {
        mindGlobalPrior: { findFirst: jest.fn() },
        workspace: { findMany: jest.fn() },
        mindBanditArm: {
          findMany: jest.fn().mockResolvedValue([
            { alpha: 3, beta: 7, pulls: 10 },
            { alpha: 2, beta: 8, pulls: 10 },
          ]),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.getPriorTuple('sms', 'timing', 'send_at_9am');

      expect(result!.observations).toBe(20);
    });

    it('channel parameter is forwarded (does not throw) and query filters by decisionType+arm', async () => {
      const prisma = {
        mindGlobalPrior: { findFirst: jest.fn() },
        workspace: { findMany: jest.fn() },
        mindBanditArm: {
          findMany: jest.fn().mockResolvedValue([{ alpha: 2, beta: 2, pulls: 4 }]),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      await service.getPriorTuple('email', 'promo', 'coupon_10pct');

      expect(prisma.mindBanditArm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: partialMatch({ decisionType: 'promo', arm: 'coupon_10pct' }),
        }),
      );
    });
  });

  describe('lookupPrior', () => {
    it('returns alpha/beta derived from prior mean/variance', async () => {
      const prior = {
        id: 'gp-1',
        workspaceId: null,
        domain: 'contact:returning',
        predicate: 'P(reply)',
        context: { channel: 'email' },
        mean: 0.7,
        variance: 0.01,
        samples: 100,
        anonymizedBy: 'test',
      };
      const prisma = {
        mindGlobalPrior: {
          findFirst: jest.fn().mockResolvedValue(prior),
        },
        workspace: {
          findMany: jest.fn(),
        },
        mindBanditArm: {
          findMany: jest.fn(),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.lookupPrior('contact:returning', 'P(reply)', {
        channel: 'email',
      });

      expect(result).not.toBeNull();
      expect(result!.alpha).toBeCloseTo(14.0, 0);
      expect(result!.beta).toBeCloseTo(6.0, 0);
    });

    it('returns null when no prior row exists', async () => {
      const prisma = {
        mindGlobalPrior: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        workspace: {
          findMany: jest.fn(),
        },
        mindBanditArm: {
          findMany: jest.fn(),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.lookupPrior('nonexistent', 'P(x)', {});

      expect(result).toBeNull();
    });

    it('returns null when variance is zero (degenerate prior)', async () => {
      const prior = {
        id: 'gp-degen',
        workspaceId: null,
        domain: 'x',
        predicate: 'P(y)',
        context: {},
        mean: 0.5,
        variance: 0,
        samples: 10,
        anonymizedBy: 'test',
      };
      const prisma = {
        mindGlobalPrior: {
          findFirst: jest.fn().mockResolvedValue(prior),
        },
        workspace: {
          findMany: jest.fn(),
        },
        mindBanditArm: {
          findMany: jest.fn(),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.lookupPrior('x', 'P(y)', {});

      expect(result).toBeNull();
    });

    it('returns null when mean is at boundary (mean=0)', async () => {
      const prior = {
        id: 'gp-boundary',
        workspaceId: null,
        domain: 'x',
        predicate: 'P(y)',
        context: {},
        mean: 0,
        variance: 0.01,
        samples: 10,
        anonymizedBy: 'test',
      };
      const prisma = {
        mindGlobalPrior: {
          findFirst: jest.fn().mockResolvedValue(prior),
        },
        workspace: {
          findMany: jest.fn(),
        },
        mindBanditArm: {
          findMany: jest.fn(),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.lookupPrior('x', 'P(y)', {});

      expect(result).toBeNull();
    });

    it('returns null when mean is at boundary (mean=1)', async () => {
      const prior = {
        id: 'gp-boundary-1',
        workspaceId: null,
        domain: 'x',
        predicate: 'P(y)',
        context: {},
        mean: 1,
        variance: 0.01,
        samples: 10,
        anonymizedBy: 'test',
      };
      const prisma = {
        mindGlobalPrior: {
          findFirst: jest.fn().mockResolvedValue(prior),
        },
        workspace: {
          findMany: jest.fn(),
        },
        mindBanditArm: {
          findMany: jest.fn(),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.lookupPrior('x', 'P(y)', {});

      expect(result).toBeNull();
    });

    it('derives correct alpha/beta for Beta(2,8) -> mean=0.2, variance=0.0145', async () => {
      const prior = {
        id: 'gp-beta28',
        workspaceId: null,
        domain: 's',
        predicate: 'P(r)',
        context: { ch: 'sms' },
        mean: 0.2,
        variance: 0.014545,
        samples: 50,
        anonymizedBy: 'test',
      };
      const prisma = {
        mindGlobalPrior: {
          findFirst: jest.fn().mockResolvedValue(prior),
        },
        workspace: {
          findMany: jest.fn(),
        },
        mindBanditArm: {
          findMany: jest.fn(),
        },
      };
      const service = new MindGlobalPriorService(prisma as never);

      const result = await service.lookupPrior('s', 'P(r)', { ch: 'sms' });

      expect(result).not.toBeNull();
      expect(result!.alpha).toBeCloseTo(2, 0);
      expect(result!.beta).toBeCloseTo(8, 0);
    });
  });
});
