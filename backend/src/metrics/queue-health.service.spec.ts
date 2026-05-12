import { QueueHealthService } from './queue-health.service';

jest.mock('../queue/queue', () => {
  const makeQueue = (name: string) => ({
    name,
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 0, delayed: 0, failed: 0 }),
  });
  const queues: Record<string, ReturnType<typeof makeQueue>> = {
    flowQueue: makeQueue('flow'),
    campaignQueue: makeQueue('campaign'),
    scraperQueue: makeQueue('scraper'),
    mediaQueue: makeQueue('media'),
    voiceQueue: makeQueue('voice'),
    autopilotQueue: makeQueue('autopilot'),
    memoryQueue: makeQueue('memory'),
    crmQueue: makeQueue('crm'),
    webhookQueue: makeQueue('webhook'),
  };
  return {
    ...queues,
    getDlqQueue: () => ({
      name: 'dlq',
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
    }),
  };
});

describe('QueueHealthService', () => {
  it('returns one QueueSummary entry per registered queue', async () => {
    const service = new QueueHealthService();
    const result = await service.getQueuesStatus();
    expect(result).toHaveLength(9);
    expect(result.map((r) => r.name).sort()).toEqual(
      ['autopilot', 'campaign', 'crm', 'flow', 'media', 'memory', 'scraper', 'voice', 'webhook'].sort(),
    );
  });

  it('attaches threshold to every summary', async () => {
    const service = new QueueHealthService();
    const result = await service.getQueuesStatus();
    for (const summary of result) {
      expect(typeof summary.threshold).toBe('number');
      expect(summary.threshold).toBeGreaterThan(0);
    }
  });

  it('exposes main + dlq job counts', async () => {
    const service = new QueueHealthService();
    const result = await service.getQueuesStatus();
    expect(result[0].main).toEqual(
      expect.objectContaining({ waiting: 1, active: 0, delayed: 0, failed: 0 }),
    );
    expect(result[0].dlq).toEqual(
      expect.objectContaining({ waiting: 0 }),
    );
  });
});
