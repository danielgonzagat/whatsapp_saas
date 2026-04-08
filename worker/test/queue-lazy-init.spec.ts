/**
 * Regression test for PR P2-4 (and P4-5).
 *
 * Asserts that importing worker/queue.ts opens ZERO Redis connections
 * at module-import time. The historic failure mode this prevents:
 *
 *   Before P2-4 the queue.ts module created the shared connection,
 *   9 BullMQ queues, 9 DLQ queues, and 9 QueueEvents at the moment
 *   ANY worker file did `import { ... } from './queue'`. Importing
 *   worker/queue.ts in a unit test (or in a script that just wanted
 *   to enqueue one job) opened ~10 Redis sockets as a side effect.
 *
 * After P2-4 every queue and connection is created lazily on first
 * property access via Proxies. This test enforces that contract.
 *
 * Implementation: we mock ioredis at the vitest level and assert the
 * mock constructor is NOT called during the import. Then we touch one
 * queue's property and assert the constructor IS called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedisCtor, mockBullQueueCtor, mockQueueEventsCtor } = vi.hoisted(() => ({
  mockRedisCtor: vi.fn(),
  mockBullQueueCtor: vi.fn(),
  mockQueueEventsCtor: vi.fn(),
}));

vi.mock('ioredis', () => {
  // Default export: a class-like function that records construction.
  const RedisClass = function (this: any, ...args: any[]) {
    mockRedisCtor(...args);
    this.on = vi.fn().mockReturnThis();
    this.quit = vi.fn().mockResolvedValue('OK');
  } as unknown as new (...args: any[]) => any;
  return { default: RedisClass };
});

vi.mock('bullmq', () => {
  const QueueClass = function (this: any, name: string, opts: any) {
    mockBullQueueCtor(name, opts);
    this.name = name;
    this.add = vi.fn().mockResolvedValue({ id: 'mock-job' });
    this.getJob = vi.fn().mockResolvedValue(null);
    this.close = vi.fn().mockResolvedValue(undefined);
  } as unknown as new (...args: any[]) => any;
  const QueueEventsClass = function (this: any, name: string, opts: any) {
    mockQueueEventsCtor(name, opts);
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
  } as unknown as new (...args: any[]) => any;
  const WorkerClass = function () {} as unknown as new (...args: any[]) => any;
  return {
    Queue: QueueClass,
    QueueEvents: QueueEventsClass,
    Worker: WorkerClass,
  };
});

vi.mock('../resolve-redis-url', () => ({
  resolveRedisUrl: () => 'redis://localhost:6379',
  maskRedisUrl: () => 'redis://***',
}));

describe('worker/queue.ts — lazy initialization (P2-4)', () => {
  beforeEach(() => {
    mockRedisCtor.mockClear();
    mockBullQueueCtor.mockClear();
    mockQueueEventsCtor.mockClear();
    // Reset the queue module so each test starts fresh.
    vi.resetModules();
  });

  it('opens ZERO Redis connections at module import time', async () => {
    // Importing the module must not trigger any constructor calls.
    await import('../queue');

    expect(mockRedisCtor).not.toHaveBeenCalled();
    expect(mockBullQueueCtor).not.toHaveBeenCalled();
    expect(mockQueueEventsCtor).not.toHaveBeenCalled();
  });

  it('opens the shared Redis connection on first queue access', async () => {
    const queueModule = await import('../queue');

    expect(mockRedisCtor).not.toHaveBeenCalled();

    // Touch one queue — this should trigger lazy creation
    void queueModule.flowQueue.name;

    // The shared connection + the BullQueue + the DLQ + the QueueEvents
    // should all be created on first access.
    expect(mockRedisCtor).toHaveBeenCalled();
    expect(mockBullQueueCtor).toHaveBeenCalled();
  });

  it('does not re-create the queue on subsequent accesses', async () => {
    const queueModule = await import('../queue');
    void queueModule.flowQueue.name;
    const callsAfterFirst = mockBullQueueCtor.mock.calls.length;

    void queueModule.flowQueue.name;
    void queueModule.flowQueue.name;

    expect(mockBullQueueCtor.mock.calls.length).toBe(callsAfterFirst);
  });

  it('exports shutdownQueueSystem as a function', async () => {
    const queueModule = await import('../queue');
    expect(typeof queueModule.shutdownQueueSystem).toBe('function');
  });
});
