import { describe, expect, it, vi } from 'vitest';
import type { QueueOptions } from 'bullmq';

const mockRedisCtor = vi.fn();
const mockBullQueueCtor = vi.fn();
const mockQueueEventsCtor = vi.fn();
const mockWorkerClose = vi.fn();

vi.mock('../queue', () => {
  // NOT trigger any constructor calls
  const queue = {
    start: vi.fn().mockResolvedValue(undefined),
    connection: {} as never,
    options: {} as QueueOptions,
  };
  return { queue };
});

interface MockRedisInstance {
  on: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
}

interface MockQueueInstance {
  name: string;
  add: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockQueueEventsInstance {
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockWorkerInstance {
  close: ReturnType<typeof vi.fn>;
}

vi.mock('ioredis', () => {
  const RedisClass = function (this: MockRedisInstance, ...args: unknown[]) {
    mockRedisCtor(...args);
    this.on = vi.fn().mockReturnThis();
    this.quit = vi.fn().mockResolvedValue('OK');
  } as unknown as new (...args: unknown[]) => unknown;
  return { default: RedisClass };
});

vi.mock('bullmq', () => {
  const QueueClass = function (this: MockQueueInstance, name: string, opts: unknown) {
    mockBullQueueCtor(name, opts);
    this.name = name;
    this.add = vi.fn().mockResolvedValue({ id: 'mock-job' });
    this.getJob = vi.fn().mockResolvedValue(null);
    this.close = vi.fn().mockResolvedValue(undefined);
  } as unknown as new (...args: unknown[]) => unknown;
  const QueueEventsClass = function (this: MockQueueEventsInstance, name: string, opts: unknown) {
    mockQueueEventsCtor(name, opts);
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
  } as unknown as new (...args: unknown[]) => unknown;
  const WorkerClass = function (this: MockWorkerInstance) {
    this.close = mockWorkerClose;
  } as unknown as new (...args: unknown[]) => unknown;
  return {
    Queue: QueueClass,
    QueueEvents: QueueEventsClass,
    Worker: WorkerClass,
  };
});

describe('queue lazy init', () => {
  type MockedQueue = { start: () => Promise<void> };

  async function loadQueue(): Promise<MockedQueue> {
    const mod = (await import('../queue')) as { queue: MockedQueue };
    return mod.queue;
  }

  it('calls Redis constructor with the configured URL', async () => {
    const queue = await loadQueue();

    await queue.start();

    expect(mockRedisCtor).toHaveBeenCalled();
    const [redisUrl] = mockRedisCtor.mock.calls[0];
    expect(redisUrl).toBe(process.env.REDIS_URL);
  });

  it('passes connection to bullmq Queue constructor', async () => {
    const queue = await loadQueue();

    await queue.start();

    expect(mockBullQueueCtor).toHaveBeenCalled();
  });

  it('can call start multiple times without duplicate Redis', async () => {
    mockRedisCtor.mockClear();
    const queue = await loadQueue();

    await queue.start();
    await queue.start();

    expect(mockRedisCtor).toHaveBeenCalledTimes(1);
  });

  it('re-throws Redis connection errors', async () => {
    mockRedisCtor.mockImplementationOnce(() => {
      throw new Error('ECONNREFUSED');
    });

    const queue = await loadQueue();

    await expect(queue.start()).rejects.toThrow('ECONNREFUSED');
  });
});
