import { MindBeliefService } from './mind-belief.service';

describe('MindBeliefService', () => {
  it('updates binary beliefs with exact beta posterior math', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
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
        },
      ]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new MindBeliefService(prisma as never);

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
});
