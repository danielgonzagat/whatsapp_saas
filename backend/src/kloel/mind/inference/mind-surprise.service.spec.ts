import { MindSurpriseService } from './mind-surprise.service';

describe('MindSurpriseService', () => {
  it('resolves binary prediction and updates the matching belief', async () => {
    const predictor = {
      findOpen: jest.fn().mockResolvedValue({
        id: 'prediction-1',
        workspaceId: 'ws-1',
        subject: 'contact:1',
        predicate: 'P(reply|template,hour,channel)',
        context: { template: 'audio', hour: 20, channel: 'whatsapp' },
        predictedMean: 0.8,
      }),
      resolve: jest.fn().mockResolvedValue(undefined),
    };
    const beliefs = {
      observeBinary: jest.fn().mockResolvedValue({}),
    };
    const prisma = {
      mindPrediction: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    const service = new MindSurpriseService(prisma as never, beliefs as never, predictor as never);

    const surprise = await service.resolveBinary(
      'ws-1',
      'contact:1',
      'P(reply|template,hour,channel)',
      1,
    );

    expect(surprise).toBeCloseTo(-Math.log(0.8));
    expect(predictor.resolve).toHaveBeenCalledWith('ws-1', 'prediction-1', 1, surprise);
    expect(beliefs.observeBinary).toHaveBeenCalledWith(
      'ws-1',
      'contact:1',
      'P(reply|template,hour,channel)',
      { template: 'audio', hour: 20, channel: 'whatsapp' },
      1,
    );
  });

  it('returns 0 when no open prediction exists', async () => {
    const predictor = {
      findOpen: jest.fn().mockResolvedValue(null),
      resolve: jest.fn(),
    };
    const beliefs = { observeBinary: jest.fn() };
    const prisma = {
      mindPrediction: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    const service = new MindSurpriseService(prisma as never, beliefs as never, predictor as never);

    const surprise = await service.resolveBinary('ws-1', 'c:1', 'P(reply)', 1);

    expect(surprise).toBe(0);
    expect(predictor.resolve).not.toHaveBeenCalled();
    expect(beliefs.observeBinary).not.toHaveBeenCalled();
  });

  describe('sweepExpired', () => {
    it('sweeps expired predictions atomically via transaction', async () => {
      const predictor = { findOpen: jest.fn(), resolve: jest.fn() };
      const beliefs = { observeBinary: jest.fn().mockResolvedValue({}) };
      const prisma = {
        mindPrediction: { findMany: jest.fn() },
        $queryRaw: jest.fn(),
        $executeRaw: jest.fn(),
        $transaction: jest.fn(),
      };

      const sweepRow = {
        id: 'pred-sweep',
        workspaceId: 'ws-1',
        subject: 'contact:exp',
        predicate: 'P(reply)',
        context: { channel: 'sms' },
        predictedMean: 0.7,
      };

      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            $queryRaw: jest.Mock;
            mindPrediction: { updateMany: jest.Mock };
          }) => Promise<number>,
        ) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([sweepRow]),
            mindPrediction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          };
          return fn(tx);
        },
      );

      const service = new MindSurpriseService(
        prisma as never,
        beliefs as never,
        predictor as never,
      );

      const result = await service.sweepExpired('ws-1', new Date());

      expect(result).toBeCloseTo(-Math.log(1 - 0.7));
      expect(beliefs.observeBinary).toHaveBeenCalled();
    });

    it('returns 0 when no predictions are expired', async () => {
      const predictor = { findOpen: jest.fn(), resolve: jest.fn() };
      const beliefs = { observeBinary: jest.fn() };
      const prisma = {
        mindPrediction: { findMany: jest.fn() },
        $queryRaw: jest.fn(),
        $executeRaw: jest.fn(),
        $transaction: jest.fn(),
      };

      prisma.$transaction.mockImplementation(
        async (
          fn: (tx: {
            $queryRaw: jest.Mock;
            mindPrediction: { updateMany: jest.Mock };
          }) => Promise<number>,
        ) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            mindPrediction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          };
          return fn(tx);
        },
      );

      const service = new MindSurpriseService(
        prisma as never,
        beliefs as never,
        predictor as never,
      );

      const result = await service.sweepExpired('ws-1', new Date());

      expect(result).toBe(0);
    });
  });

  describe('computeSurprise', () => {
    const makeService = () => {
      const prisma = {
        mindPrediction: { findMany: jest.fn() },
        $queryRaw: jest.fn(),
        $executeRaw: jest.fn(),
        $transaction: jest.fn(),
      };
      const beliefs = { observeBinary: jest.fn() };
      const predictor = { findOpen: jest.fn(), resolve: jest.fn() };
      return new MindSurpriseService(prisma as never, beliefs as never, predictor as never);
    };

    it('returns high surprise when predicted low (0.1) and observed=1', () => {
      const svc = makeService();
      const s = svc.computeSurprise(0.1, 1);
      expect(s).toBeCloseTo(-Math.log(0.1));
      expect(s).toBeGreaterThan(1.5);
    });

    it('returns high surprise when predicted high (0.9) and observed=0', () => {
      const svc = makeService();
      const s = svc.computeSurprise(0.9, 0);
      expect(s).toBeCloseTo(-Math.log(0.1));
      expect(s).toBeGreaterThan(1.5);
    });

    it('returns low surprise when predicted matches observation', () => {
      const svc = makeService();
      const s = svc.computeSurprise(0.9, 1);
      expect(s).toBeCloseTo(-Math.log(0.9));
      expect(s).toBeLessThan(0.3);
    });

    it('clamps extreme predicted values to avoid log(0)', () => {
      const svc = makeService();
      // predicted=0 clamped to 1e-6, observed=1 → -ln(1e-6)
      expect(svc.computeSurprise(0, 1)).toBeCloseTo(-Math.log(1e-6));
      // predicted=1 clamped to 1-1e-6, observed=0 → -ln(1e-6)
      expect(svc.computeSurprise(1, 0)).toBeCloseTo(-Math.log(1e-6));
    });

    it('returns surprise > 0.3 when predicted=0.7 and observed=0', () => {
      const svc = makeService();
      const s = svc.computeSurprise(0.7, 0);
      expect(s).toBeCloseTo(-Math.log(0.3));
      expect(s).toBeGreaterThan(0.3);
    });

    it('returns surprise <= 0.3 when predicted=0.75 and observed=1', () => {
      const svc = makeService();
      const s = svc.computeSurprise(0.75, 1);
      expect(s).toBeCloseTo(-Math.log(0.75));
      expect(s).toBeLessThan(0.3);
    });
  });
});
