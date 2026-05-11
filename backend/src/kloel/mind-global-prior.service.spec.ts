import { MindGlobalPriorService } from './mind-global-prior.service';

describe('MindGlobalPriorService', () => {
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
