/**
 * Worker BullMQ queue system — lazy initialization (PR P2-4).
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
import Redis from 'ioredis';
import { maskRedisUrl, resolveRedisUrl } from './resolve-redis-url';

// ─── Lazy Redis connection ────────────────────────────────────────────────

const redisOpts = {
  maxRetriesPerRequest: null as null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
};

let _connection: Redis | null = null;

function getConnection(): Redis {
  if (_connection) {
    return _connection;
  }

  const resolved = resolveRedisUrl();
  if (!resolved) {
    console.error(
      '❌ [QUEUE] Redis URL is null. Worker bootstrap should have prevented this. Exiting.',
    );
    process.exit(1);
  }

  console.log('========================================');
  console.log(`✅ [QUEUE] Connecting to Redis: ${maskRedisUrl(resolved)}`);
  console.log('========================================');

  _connection = new Redis(resolved, redisOpts);
  _connection.on('error', (err) => {
    console.error('❌ [QUEUE] Redis error:', err.message);
  });
  _connection.on('connect', () => {
    console.log('📡 [QUEUE] Conectado ao Redis');
  });
  _connection.on('ready', () => {
    console.log('✅ [QUEUE] Redis pronto para comandos');
  });
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

function buildQueueOptions() {
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

function getOrCreateQueue(name: string): BullQueue {
  const existing = queueRegistryMap.get(name);
  if (existing) {
    return existing;
  }

  const queue = new BullQueue(name, buildQueueOptions());
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

        await dlq.add(
          'failed',
          {
            originalQueue: queue.name,
            jobName: job.name,
            data: job.data,
            opts: job.opts,
            failedReason,
            failedAt: new Date().toISOString(),
          },
          { jobId: job.id, removeOnComplete: true },
        );
        await notifyOps({
          queue: queue.name,
          jobId: job.id ?? undefined,
          jobName: job.name,
          reason: failedReason,
        });
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        console.error(
          '[DLQ] Falha ao mover job %s da fila %s: %s',
          jobId,
          queue.name,
          errInstanceofError?.message || err,
        );
      }
    })();
  });
}

export function getQueueEvents(queueName: string): QueueEvents {
  const existing = queueEventsRegistry.get(queueName);
  if (existing) {
    return existing;
  }

  // QueueEvents requires its own blocking connection per BullMQ docs.
  const resolved = resolveRedisUrl();
  if (!resolved) {
    throw new Error('Cannot create QueueEvents: Redis URL unavailable');
  }
  const events = new QueueEvents(queueName, { connection: new Redis(resolved, redisOpts) });
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

export const flowQueue = lazyQueue('flow-jobs');
export const campaignQueue = lazyQueue('campaign-jobs');
export const scraperQueue = lazyQueue('scraper-jobs');
export const mediaQueue = lazyQueue('media-jobs');
export const voiceQueue = lazyQueue('voice-jobs');
export const memoryQueue = lazyQueue('memory-jobs');
export const crmQueue = lazyQueue('crm-jobs');
export const autopilotQueue = lazyQueue('autopilot-jobs');
export const webhookQueue = lazyQueue('webhook-jobs');

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
];

// ─── DLQ webhook notifier ─────────────────────────────────────────────────

interface DlqEvent {
  queue: string;
  jobId?: string | number;
  jobName?: string;
  reason?: string;
}

interface DlqPayload extends DlqEvent {
  type: 'dlq_event';
  env: string;
  at: string;
}

const buildDlqPayload = (input: DlqEvent): DlqPayload => ({
  type: 'dlq_event',
  queue: input.queue,
  jobId: input.jobId,
  jobName: input.jobName,
  reason: input.reason,
  env: process.env.NODE_ENV || 'dev',
  at: new Date().toISOString(),
});

const buildSlackBody = (payload: DlqPayload): { text: string } => ({
  text: `DLQ ${payload.queue} -> job ${payload.jobName || payload.jobId || 'unknown'} (${payload.reason || 'no reason'}) [${payload.env}]`,
});

const buildTeamsBody = (payload: DlqPayload): Record<string, unknown> => ({
  '@type': 'MessageCard',
  '@context': 'http://schema.org/extensions',
  summary: 'DLQ Event',
  themeColor: 'E53935',
  title: `DLQ ${payload.queue}`,
  sections: [
    {
      facts: [
        { name: 'Job', value: String(payload.jobName || payload.jobId || 'unknown') },
        { name: 'Reason', value: payload.reason || 'n/a' },
        { name: 'Env', value: payload.env },
        { name: 'At', value: payload.at },
      ],
    },
  ],
});

const buildWebhookBody = (
  payload: DlqPayload,
  type: 'slack' | 'teams' | 'generic',
): Record<string, unknown> => {
  if (type === 'slack') {
    return buildSlackBody(payload);
  }
  if (type === 'teams') {
    return buildTeamsBody(payload);
  }
  return payload as unknown as Record<string, unknown>;
};

const resolveFetch = (): typeof globalThis.fetch | undefined =>
  typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined;

const normalizeError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');

async function notifyOps(input: DlqEvent) {
  const webhook = process.env.DLQ_WEBHOOK_URL || process.env.OPS_WEBHOOK_URL;
  if (!webhook) {
    return;
  }
  const fetchFn = resolveFetch();
  if (!fetchFn) {
    return;
  }

  try {
    const payload = buildDlqPayload(input);
    const body = buildWebhookBody(payload, classifyWebhook(webhook));
    await fetchFn(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const e = normalizeError(err);
    console.warn('[DLQ] Falha ao notificar webhook (%s): %s', webhook, e.message || err);
  }
}

function classifyWebhook(webhook: string): 'slack' | 'teams' | 'generic' {
  try {
    const host = new URL(webhook).hostname.toLowerCase();
    if (host === 'hooks.slack.com') {
      return 'slack';
    }
    if (
      host === 'outlook.office.com' ||
      host === 'outlook.office365.com' ||
      host.endsWith('.office.com') ||
      host.endsWith('.office365.com')
    ) {
      return 'teams';
    }
  } catch {
    return 'generic';
  }

  return 'generic';
}

// ─── Backwards-compatible Queue wrapper class ────────────────────────────

/**
 * Wrapper para criar filas com interface simplificada.
 * Usa automaticamente a conexão Redis configurada.
 */
export class Queue {
  private queue: BullQueue;
  private name: string;
  private worker?: Worker;

  constructor(name: string) {
    this.name = name;
    this.queue = new BullQueue(name, buildQueueOptions());
    additionalWorkers.push(); // placeholder; real workers added in on()
    console.log(`📦 [Queue] Criada fila "${name}" com conexão Redis configurada`);
  }

  async push<T extends Record<string, unknown>>(data: T, opts?: Record<string, unknown>) {
    return this.queue.add('default', data, opts);
  }

  on<T>(event: 'job', callback: (job: T) => Promise<void>) {
    if (event === 'job') {
      this.worker = new Worker(
        this.name,
        async (job: Job) => {
          await callback(job.data);
        },
        { connection: getConnection() },
      );
      additionalWorkers.push(this.worker);
      console.log(`👷 [Queue] Worker criado para fila "${this.name}"`);
    }
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
    }
    await this.queue.close();
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

export async function shutdownQueueSystem(timeoutMs = 10_000): Promise<void> {
  const closers = collectClosers();
  await awaitCloserOrTimeout(closers, timeoutMs);
  await closeSharedConnection();
  resetQueueRegistries();
  console.log('✅ [QUEUE] shutdownQueueSystem complete');
}
