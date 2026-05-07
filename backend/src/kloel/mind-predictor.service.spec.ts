import { MindPredictorService } from './mind-predictor.service';

describe('MindPredictorService', () => {
  it('persists prediction rows from current belief posterior', async () => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
    };
    const beliefs = {
      getOrInit: jest.fn().mockResolvedValue({
        mean: 0.7,
        variance: 0.04,
      }),
    };
    const service = new MindPredictorService(prisma as never, beliefs as never);

    const prediction = await service.predictReply(
      {
        workspaceId: 'ws-1',
        subject: 'contact:1',
        features: { template: 'audio', hour: 20, channel: 'whatsapp', ignored: 'noise' },
      },
      3600,
    );

    expect(prediction.predicate).toBe('P(reply|template,hour,channel)');
    expect(prediction.context).toEqual({ template: 'audio', hour: 20, channel: 'whatsapp' });
    expect(prediction.predictedMean).toBe(0.7);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});
