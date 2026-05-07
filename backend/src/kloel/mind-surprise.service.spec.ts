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
    expect(predictor.resolve).toHaveBeenCalledWith('prediction-1', 1, surprise);
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
        async (fn: (tx: { $queryRaw: jest.Mock; $executeRaw: jest.Mock }) => Promise<number>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([sweepRow]),
            $executeRaw: jest.fn().mockResolvedValue(1),
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
        async (fn: (tx: { $queryRaw: jest.Mock; $executeRaw: jest.Mock }) => Promise<number>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            $executeRaw: jest.fn().mockResolvedValue(1),
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
});
