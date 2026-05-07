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
    const service = new MindSurpriseService(
      { $queryRaw: jest.fn() } as never,
      beliefs as never,
      predictor as never,
    );

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
});
