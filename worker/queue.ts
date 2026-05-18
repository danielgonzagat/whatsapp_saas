/**
 * ARCHITECTURAL COHESION: This file is a single organism — the Lazy Queue
 * System. It manages the complete lifecycle of BullMQ queues: lazy Redis
 * connection, lazy queue/DLQ/QueueEvents creation via Proxy, DLQ-to-ops
 * notification (delegated to queue-dlq-notifier.ts), backwards-compatible
 * Queue wrapper, and graceful shutdown. These concerns form a single
 * responsibility: "provide type-safe, lazily-initialized queue primitives
 * that open zero Redis connections on import." Splitting would break the
 * Proxy-based lazy initialization pattern that is the entire point of
 * this module.
 *
 * Before P2-4 this module created the shared Redis connection and
 * 9 BullMQ queues + 9 DLQ queues + 9 QueueEvents at module-import
 * time. Total: ~10 Redis sockets opened the moment any worker file
 * imported anything from './queue'. That side-effect-on-import
 * pattern made tests fragile, complicated process startup ordering,
 * and prevented `worker/queue.ts` from being safely imported in
 * environments without Redis (vitest, scripts, partial deployments).
 *
 * After P2-4 every queue and connection is created on first access
 * via a Proxy. Importing this module opens ZERO Redis connections.
 * The first call to `flowQueue.add(...)` (or any other forwarded
 * method) triggers lazy creation of the shared connection + the
 * named queue + its DLQ + its QueueEvents.
 *
 * A `shutdownQueueSystem()` export closes everything that was
 * actually created, in reverse order. The worker's `processor.ts`
 * SIGTERM/SIGINT handlers invoke it before exiting so live BullMQ
 * jobs get a chance to finish or fail cleanly.
 *
 * **Connection budget per worker process** (after first lazy init):
 *   - 1 shared queue connection (used by all 9 BullMQ queues + DLQs)
 *   - 9 QueueEvents (each requires its own blocking Redis connection)
 *   - 3 redis-client.ts clients (redis, redisSub, redisPub)
 *   Total: ~13 Redis sockets when fully warmed up.
 *
 * The regression test at worker/test/queue-lazy-init.spec.ts proves
 * that importing this module opens zero connections.
 */

import { Queue as BullQueue, type Job, QueueEvents, Worker } from 'bullmq';
import Redis, { type RedisOptions } from 'ioredis';
import { maskRedisUrl, resolveRedisUrl } from './resolve-redis-url';

// ─── Lazy Redis connection ────────────────────────────────────────────────

const redisOpts = {
  family: 0,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
};

let _connection: Redis | null = null;
type BullMqRedisOptions = RedisOptions & { url: string };

const resolveRequiredRedisUrl = (context: string): string => {
  const resolved = resolveRedisUrl();
  if (!resolved) {
    console.error(
      `[ERROR] [QUEUE] Redis URL is null while creating ${context}. Worker bootstrap should have prevented this. Exiting.`,
    );
    process.exit(1);
  }
  return resolved;
};

const collectRedisDuplicateOverrides = (args: unknown[]): RedisOptions => {
  const overrides: RedisOptions = {};
  for (const arg of args) {
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(overrides, arg);
    }
  }
  return overrides;
};

const createRedisConnection = (
  context: string,
  overrides: RedisOptions = {},
  attachQueueLogs = false,
): Redis => {
  const resolved = resolveRequiredRedisUrl(context);
  const options: RedisOptions = { ...redisOpts, ...overrides };
  const client = new Redis(resolved, options);

  client.duplicate = ((...args: unknown[]) =>
    createRedisConnection(
      `${context}:duplicate`,
      { ...options, ...collectRedisDuplicateOverrides(args) },
      attachQueueLogs,
    )) as Redis['duplicate'];

  if (attachQueueLogs) {
    client.on('error', (err) => {
      console.error('[ERROR] [QUEUE] Redis error:', err.message);
    });
    client.on('connect', () => {
      console.log('[QUEUE] Conectado ao Redis');
    });
    client.on('ready', () => {
      console.log('[OK] [QUEUE] Redis pronto para comandos');
    });
  }

  return client;
};

const buildBullMqConnectionOptions = (context: string): BullMqRedisOptions => ({
  url: resolveRequiredRedisUrl(context),
  ...redisOpts,
});

function getConnection(): Redis {
  if (_connection) {
    return _connection;
  }

  const resolved = resolveRequiredRedisUrl('shared BullMQ connection');

  console.log('========================================');
  console.log(`[OK] [QUEUE] Connecting to Redis: ${maskRedisUrl(resolved)}`);
  console.log('========================================');

  _connection = createRedisConnection('shared BullMQ connection', {}, true);
  return _connection;
}

// Backwards-compat: callers that imported `connection` directly get
// a Proxy that forwards every property access to the lazy connection.
// First access triggers creation.
export const connection = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    const conn = getConnection();
    const value = Reflect.get(conn, prop, receiver);
    return typeof value === 'function' ? value.bind(conn) : value;
  },
}) as Redis;

// ─── Lazy queue, DLQ, QueueEvents creation ────────────────────────────────

const defaultAttempts = Math.max(1, Number.parseInt(process.env.QUEUE_ATTEMPTS || '3', 10) || 3);
const defaultBackoff = Math.max(
  1000,
  Number.parseInt(process.env.QUEUE_BACKOFF_MS || '5000', 10) || 5000,
);

export function buildQueueOptions() {
  return {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: defaultAttempts,
      backoff: { type: 'exponential', delay: defaultBackoff },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  };
}

const queueRegistryMap = new Map<string, BullQueue>();
const dlqRegistryMap = new Map<string, BullQueue>();
const queueEventsRegistry = new Map<string, QueueEvents>();
const additionalWorkers: Worker[] = [];

function logBullMqBackgroundError(label: string, err: Error): void {
  console.warn(`[QUEUE] ${label} background error: ${err.message}`);
}

type ErrorEmitter = {
  on: (event: 'error', handler: (err: Error) => void) => unknown;
};

function hasErrorEmitter(value: unknown): value is ErrorEmitter {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'on' in value &&
    typeof (value as { on?: unknown }).on === 'function',
  );
}

function attachQueueErrorLogger(queue: BullQueue, label: string): void {
  if (hasErrorEmitter(queue)) {
    queue.on('error', (err) => logBullMqBackgroundError(label, err));
  }
}

function attachQueueEventsErrorLogger(events: QueueEvents, label: string): void {
  if (hasErrorEmitter(events)) {
    events.on('error', (err) => logBullMqBackgroundError(label, err));
  }
}

function attachWorkerErrorLogger(worker: Worker, label: string): void {
  if (hasErrorEmitter(worker)) {
    worker.on('error', (err) => logBullMqBackgroundError(label, err));
  }
}

function getOrCreateQueue(name: string): BullQueue {
  const existing = queueRegistryMap.get(name);
  if (existing) {
    return existing;
  }

  const queue = new BullQueue(name, buildQueueOptions());
  attachQueueErrorLogger(queue, `queue:${name}`);
  queueRegistryMap.set(name, queue);
  attachDlq(queue);
  return queue;
}

function attachDlq(queue: BullQueue) {
  const dlqName = `${queue.name}-dlq`;
  if (dlqRegistryMap.has(dlqName)) {
    return;
  }

  const dlq = new BullQueue(dlqName, buildQueueOptions());
  attachQueueErrorLogger(dlq, `queue:${dlqName}`);
  dlqRegistryMap.set(dlqName, dlq);

  const events = getQueueEvents(queue.name);
  events.on('failed', (event) => {
    void (async () => {
      const { jobId, failedReason, attemptsMade } = event as {
        jobId: string;
        failedReason: string;
        attemptsMade: number;
        prev?: string;
      };
      try {
        const job = await queue.getJob(jobId);
        if (!job) {
          return;
        }
        const maxAttempts = job.opts.attempts ?? defaultAttempts;
        if (attemptsMade < maxAttempts) {
          return;
        }

        const workspaceId =
          (job.data as Record<string, unknown> | undefined)?.workspaceId ??
          (() => {
            const d = job.data as Record<string, unknown> | undefined;
            const ws = d?.workspace;
            if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
              return (ws as Record<string, unknown>).id;
            }
            return undefined;
          })();
        const correlationId = (job.data as Record<string, unknown> | undefined)?.correlationId;

        await dlq.add(
          'failed',
          {
            originalQueue: queue.name,
            jobName: job.name,
            data: job.data,
            opts: job.opts,
            failedReason,
            failedAt: new Date().toISOString(),
            ...(correlationId ? { correlationId } : {}),
            ...(workspaceId ? { workspaceId } : {}),
          },
          { ...(job.id ? { jobId: job.id } : {}), removeOnComplete: true },
        );
        await notifyOps({
          queue: queue.name,
          jobId: job.id ?? undefined,
          jobName: job.name,
          reason: failedReason,
        });
      } catch (err: unknown) {
        console.error(
          '[DLQ] Falha ao mover job %s da fila %s: %s',
          jobId,
          queue.name,
          err instanceof Error ? err.message : String(err),
        );
      }
    })();
  });
}

/** Get queue events. */
export function getQueueEvents(queueName: string): QueueEvents {
  const existing = queueEventsRegistry.get(queueName);
  if (existing) {
    return existing;
  }

  // QueueEvents requires its own blocking connection per BullMQ docs.
  const events = new QueueEvents(queueName, {
    connection: buildBullMqConnectionOptions(`QueueEvents:${queueName}`),
  });
  attachQueueEventsErrorLogger(events, `queueEvents:${queueName}`);
  queueEventsRegistry.set(queueName, events);
  return events;
}

// ─── Lazy queue Proxies (backwards compat exports) ───────────────────────

function lazyQueue(name: string): BullQueue {
  return new Proxy({} as BullQueue, {
    get(_target, prop, receiver) {
      const real = getOrCreateQueue(name);
      const value = Reflect.get(real, prop, receiver);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  }) as BullQueue;
}

/** Flow queue. */
export const flowQueue = lazyQueue('flow-jobs');
/** Campaign queue. */
export const campaignQueue = lazyQueue('campaign-jobs');
/** Scraper queue. */
export const scraperQueue = lazyQueue('scraper-jobs');
/** Media queue. */
export const mediaQueue = lazyQueue('media-jobs');
/** Voice queue. */
export const voiceQueue = lazyQueue('voice-jobs');
/** Memory queue. */
export const memoryQueue = lazyQueue('memory-jobs');
/** Crm queue. */
export const crmQueue = lazyQueue('crm-jobs');
/** Autopilot queue. */
export const autopilotQueue = lazyQueue('autopilot-jobs');
/** Webhook queue. */
export const webhookQueue = lazyQueue('webhook-jobs');
/** Silent 24h resolver queue. */
export const silent24hResolverQueue = lazyQueue('silent-24h-resolver');

// queueOptions is built lazily so reading it does not trigger
// connection creation unless someone actually consumes it.
export const queueOptions = new Proxy({} as ReturnType<typeof buildQueueOptions>, {
  get(_target, prop, receiver) {
    const real = buildQueueOptions();
    return Reflect.get(real, prop, receiver);
  },
});

// queueRegistry is the historical export used by dlq-monitor.ts.
// We keep it as an array of lazy queue proxies so iterating still
// works the same way without triggering early initialization.
export const queueRegistry: BullQueue[] = [
  flowQueue,
  campaignQueue,
  scraperQueue,
  mediaQueue,
  voiceQueue,
  memoryQueue,
  crmQueue,
  autopilotQueue,
  webhookQueue,
  silent24hResolverQueue,
];

// ─── DLQ webhook notifier ─────────────────────────────────────────────────

import { notifyOps } from './queue-dlq-notifier';

// ─── Backwards-compatible Queue wrapper class ────────────────────────────

/**
 * Wrapper para criar filas com interface simplificada.
 * Usa automaticamente a conexão Redis configurada.
 */
export class Queue {
  private queue: BullQueue;
  private name: string;
  private worker?: Worker | undefined;
  private closed = false;

  constructor(name: string) {
    this.name = name;
    this.queue = new BullQueue(name, buildQueueOptions());
    attachQueueErrorLogger(this.queue, `legacyQueue:${name}`);
    console.log(`[PKG] [Queue] Criada fila "${name}" com conexão Redis configurada`);
  }

  /** Push. */
  async push<T extends Record<string, unknown>>(data: T, opts?: Record<string, unknown>) {
    return this.queue.add('default', data, opts);
  }

  /** On. */
  on<T>(event: 'job', callback: (job: T) => Promise<void>) {
    if (event === 'job') {
      this.worker = new Worker(
        this.name,
        async (job: Job) => {
          await callback(job.data);
        },
        {
          connection: buildBullMqConnectionOptions(`QueueWorker:${this.name}`),
          lockDuration: 120_000,
        },
      );
      attachWorkerErrorLogger(this.worker, `legacyWorker:${this.name}`);
      additionalWorkers.push(this.worker);
      console.log(`[Queue] Worker criado para fila "${this.name}"`);
    }
  }

  /** Close. */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    if (this.worker) {
      const worker = this.worker;
      await worker.close();
      const workerIndex = additionalWorkers.indexOf(worker);
      if (workerIndex >= 0) {
        additionalWorkers.splice(workerIndex, 1);
      }
      this.worker = undefined;
    }
    await this.queue.close();
    this.closed = true;
  }
}

// ─── Graceful shutdown ───────────────────────────────────────────────────

/**
 * Close every queue, DLQ, QueueEvents, and Worker that was created
 * during this process's lifetime, in reverse order. Safe to call
 * multiple times. Should be invoked from SIGTERM/SIGINT handlers.
 *
 * @param timeoutMs Maximum total time to wait for all closes. After
 *                   this elapses the function returns regardless.
 */
interface Closeable {
  close: () => Promise<unknown>;
}

const closeWithWarn = (item: Closeable, label: string): Promise<unknown> =>
  item.close().catch((err) => console.warn(`[SHUTDOWN] ${label} close failed:`, err));

const collectClosers = (): Promise<unknown>[] => {
  const closers: Promise<unknown>[] = [];
  for (const w of additionalWorkers) {
    closers.push(closeWithWarn(w, 'worker'));
  }
  for (const ev of queueEventsRegistry.values()) {
    closers.push(closeWithWarn(ev, 'queueEvents'));
  }
  for (const dlq of dlqRegistryMap.values()) {
    closers.push(closeWithWarn(dlq, 'dlq'));
  }
  for (const q of queueRegistryMap.values()) {
    closers.push(closeWithWarn(q, 'queue'));
  }
  return closers;
};

const awaitCloserOrTimeout = async (
  closers: Promise<unknown>[],
  timeoutMs: number,
): Promise<void> => {
  await Promise.race([
    Promise.allSettled(closers),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
};

const closeSharedConnection = async (): Promise<void> => {
  if (!_connection) {
    return;
  }
  try {
    await _connection.quit();
  } catch (err) {
    console.warn('[SHUTDOWN] connection quit failed:', err);
  }
  _connection = null;
};

const resetQueueRegistries = (): void => {
  additionalWorkers.length = 0;
  queueEventsRegistry.clear();
  dlqRegistryMap.clear();
  queueRegistryMap.clear();
};

/** Shutdown queue system. */
export async function shutdownQueueSystem(timeoutMs = 10_000): Promise<void> {
  const closers = collectClosers();
  await awaitCloserOrTimeout(closers, timeoutMs);
  await closeSharedConnection();
  resetQueueRegistries();
  console.log('[OK] [QUEUE] shutdownQueueSystem complete');
}
