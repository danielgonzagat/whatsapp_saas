import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBullQueueCtor, mockJobCounts, mockRedisPing, mockEventOn } = vi.hoisted(() => ({
  mockBullQueueCtor: vi.fn(),
  mockJobCounts: vi.fn().mockResolvedValue({
    active: 0,
    completed: 0,
    delayed: 0,
    failed: 0,
    paused: 0,
    waiting: 3,
    'waiting-children': 0,
  }),
  mockRedisPing: vi.fn().mockResolvedValue('PONG'),
  mockEventOn: vi.fn(),
}));

vi.mock('ioredis', () => {
  class RedisMock {
    ping = mockRedisPing;
    on = vi.fn().mockReturnThis();
    quit = vi.fn().mockResolvedValue('OK');
  }
  return { default: RedisMock };
});

vi.mock('bullmq', () => {
  class QueueMock {
    name: string;

    constructor(name: string) {
      mockBullQueueCtor(name);
      this.name = name;
    }

    getJobCounts() {
      return mockJobCounts();
    }
  }

  class QueueEventsMock {
    on = mockEventOn;
    close = vi.fn().mockResolvedValue(undefined);
  }

  class WorkerMock {
    close = vi.fn().mockResolvedValue(undefined);
  }

  return { Queue: QueueMock, QueueEvents: QueueEventsMock, Worker: WorkerMock };
});

vi.mock('../resolve-redis-url', () => ({
  resolveRedisUrl: () => 'redis://localhost:6379',
  maskRedisUrl: () => 'redis://***',
}));

describe('worker health — autopilot queue info', () => {
  beforeEach(() => {
    mockBullQueueCtor.mockClear();
    mockJobCounts.mockClear();
    mockRedisPing.mockClear();
    vi.resetModules();
  });

  it('getHealth() returns ok when redis pongs and queue responds', async () => {
    const { getHealth } = await import('../metrics');

    const health = await getHealth();

    expect(health.status).toBe('ok');
    expect(health.redis).toBe('PONG');
    expect(health.queues?.autopilot).toBeDefined();
    expect(health.queues?.autopilot.waiting).toBe(3);
    expect(typeof health.queues?.autopilot.waiting).toBe('number');
    expect(typeof health.queues?.autopilot.active).toBe('number');
  });

  it('getHealth() returns degraded when redis ping fails', async () => {
    mockRedisPing.mockResolvedValueOnce('ERROR');
    const { getHealth } = await import('../metrics');

    const health = await getHealth();

    expect(health.status).toBe('degraded');
    expect(health.redis).toBe('ERROR');
  });

  it('getHealth() returns down when connection or queue throws', async () => {
    mockRedisPing.mockRejectedValueOnce(new Error('connection refused'));
    const { getHealth } = await import('../metrics');

    const health = await getHealth();

    expect(health.status).toBe('down');
    expect(health.error).toBe('connection refused');
  });

  it('getHealth() returns down with unknown_error for non-Error throws', async () => {
    mockRedisPing.mockRejectedValueOnce('boom');
    const { getHealth } = await import('../metrics');

    const health = await getHealth();

    expect(health.status).toBe('down');
    expect(health.error).toBe('unknown_error');
  });
});
