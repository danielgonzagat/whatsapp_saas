import { Logger } from '@nestjs/common';
import { Queue as BullQueue, QueueEvents, Worker } from 'bullmq';
import { createRedisClient, getRedisUrl, maskRedisUrl } from '../common/redis/redis.util';

// ============================================================================
// LAZY INITIALIZATION - Conexão só é criada quando acessada pela primeira vez
// Isso garante que o bootstrap.ts já interceptou o ioredis antes da conexão
// ============================================================================

let _connection: ReturnType<typeof createRedisClient> | null = null;
let _queueOptions: {
  connection: ReturnType<typeof createRedisClient>;
  defaultJobOptions: {
    attempts: number;
    backoff: { type: string; delay: number };
    removeOnComplete: boolean;
    removeOnFail: number;
  };
} | null = null;
let _initialized = false;

const queueLogger = new Logger('Queue');
const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

const serializeQueueLogArg = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
};

const log = (...args: unknown[]) => {
  if (!isTestEnv) queueLogger.log(args.map(serializeQueueLogArg).join(' '));
};
const warn = (...args: unknown[]) => {
  if (!isTestEnv) queueLogger.warn(args.map(serializeQueueLogArg).join(' '));
};

function ensureInitialized() {
  if (_initialized) return;

  log('🔌 [QUEUE] Inicializando conexão Redis (lazy)...');
  const redisUrl = getRedisUrl();
  log('✅ [QUEUE] Conectando ao Redis:', maskRedisUrl(redisUrl));

  _connection = createRedisClient();

  const defaultAttempts = Math.max(1, Number.parseInt(process.env.QUEUE_ATTEMPTS || '3', 10) || 3);
  const defaultBackoff = Math.max(
    1000,
    Number.parseInt(process.env.QUEUE_BACKOFF_MS || '5000', 10) || 5000,
  );

  _queueOptions = {
    connection: _connection,
    defaultJobOptions: {
      attempts: defaultAttempts,
      backoff: { type: 'exponential', delay: defaultBackoff },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  };

  _initialized = true;
  log('✅ [QUEUE] Conexão Redis inicializada');
}

// Getters para acesso lazy
function getConnection() {
  ensureInitialized();
  return _connection;
}

function getQueueOptions() {
  ensureInitialized();
  return _queueOptions;
}

// Aliases para compatibilidade
export const connection = new Proxy({} as ReturnType<typeof createRedisClient>, {
  get(_, prop) {
    const currentConnection = getConnection();
    return currentConnection ? Reflect.get(currentConnection, prop) : undefined;
  },
});

export const queueOptions = new Proxy({} as Record<string | symbol, unknown>, {
  get(_, prop) {
    return (getQueueOptions() as Record<string | symbol, unknown>)[prop];
  },
});

export const queueRegistry: Record<string, BullQueue> = {};

const _dlqQueues: Record<string, BullQueue> = {};
const _queueEvents: Record<string, QueueEvents> = {};

async function notifyOps(input: {
  queue: string;
  jobId?: string | number;
  jobName?: string;
  reason?: string;
}) {
  const webhook = process.env.DLQ_WEBHOOK_URL || process.env.OPS_WEBHOOK_URL;
  if (!webhook) return;
  const webhookType = classifyWebhook(webhook);
  const isSlack = webhookType === 'slack';
  const isTeams = webhookType === 'teams';
  const fetchFn = (globalThis as Record<string, unknown>).fetch as
    | undefined
    | ((
        input: string,
        init?: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        },
      ) => Promise<unknown>);
  if (!fetchFn) return;

  try {
    const payload = {
      type: 'dlq_event',
      queue: input.queue,
      jobId: input.jobId,
      jobName: input.jobName,
      reason: input.reason,
      env: process.env.NODE_ENV || 'dev',
      at: new Date().toISOString(),
    };

    const body = isSlack
      ? {
          text: `DLQ ${payload.queue} -> job ${payload.jobName || payload.jobId || 'unknown'} (${payload.reason || 'no reason'}) [${payload.env}]`,
        }
      : isTeams
        ? {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            summary: 'DLQ Event',
            themeColor: 'E53935',
            title: `DLQ ${payload.queue}`,
            sections: [
              {
                facts: [
                  {
                    name: 'Job',
                    value: String(payload.jobName || payload.jobId || 'unknown'),
                  },
                  { name: 'Reason', value: payload.reason || 'n/a' },
                  { name: 'Env', value: payload.env },
                  { name: 'At', value: payload.at },
                ],
              },
            ],
          }
        : payload;

    await fetchFn(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'unknown_error';
    queueLogger.warn(`[DLQ] Falha ao notificar webhook (${webhook}): ${errMsg}`);
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

function attachDlq(queue: BullQueue) {
  if (!_dlqQueues[queue.name]) {
    _dlqQueues[queue.name] = new BullQueue(`${queue.name}-dlq`, getQueueOptions());
  }
  const dlq = _dlqQueues[queue.name];

  if (!_queueEvents[queue.name]) {
    _queueEvents[queue.name] = new QueueEvents(queue.name, {
      connection: getConnection(),
    });
  }
  const events = _queueEvents[queue.name];

  events.on('failed', (event) => {
    void (async () => {
      try {
        const job = await queue.getJob(event.jobId);
        if (!job) return;
        const opts = getQueueOptions();
        const maxAttempts = job.opts.attempts ?? opts.defaultJobOptions?.attempts ?? 1;
        // Só envia para DLQ após esgotar as tentativas
        if (
          (event as { attemptsMade?: number }).attemptsMade !== undefined &&
          (event as { attemptsMade?: number }).attemptsMade < maxAttempts
        )
          return;

        await dlq.add(
          'failed',
          {
            originalQueue: queue.name,
            jobName: job.name,
            data: job.data,
            opts: job.opts,
            failedReason: (event as { failedReason?: string }).failedReason,
            failedAt: new Date().toISOString(),
          },
          {
            jobId: job.id, // evita duplicar se múltiplos consumidores ouvirem o mesmo evento
            removeOnComplete: true,
          },
        );
        await notifyOps({
          queue: queue.name,
          jobId: job.id ?? undefined,
          jobName: job.name,
          reason: (event as { failedReason?: string }).failedReason,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'unknown_error';
        queueLogger.error(`[DLQ] Falha ao mover job da fila ${queue.name}: ${errMsg}`);
      }
    })();
  });
}

// ============================================================================
// LAZY INITIALIZATION DAS FILAS
// As filas só são criadas quando acessadas pela primeira vez
// ============================================================================

const _queues: Record<string, BullQueue> = {};

function getOrCreateQueue(name: string): BullQueue {
  if (!_queues[name]) {
    log(`📦 [QUEUE] Criando fila "${name}" (lazy)...`);
    _queues[name] = new BullQueue(name, getQueueOptions());
    attachDlq(_queues[name]);
    queueRegistry[name] = _queues[name];
  }
  return _queues[name];
}

// Usado por Jest para evitar handles abertos (Redis/QueueEvents) após os testes.
export async function shutdownQueueSystem() {
  try {
    const closePromises: Array<Promise<unknown>> = [];

    for (const events of Object.values(_queueEvents)) {
      closePromises.push(events.close().catch(() => undefined));
    }
    for (const queue of Object.values(_queues)) {
      closePromises.push(queue.close().catch(() => undefined));
    }
    for (const queue of Object.values(_dlqQueues)) {
      closePromises.push(queue.close().catch(() => undefined));
    }

    await Promise.all(closePromises);

    if (_connection) {
      if (typeof _connection.quit === 'function') {
        await _connection.quit().catch(() => undefined);
      } else if (typeof _connection.disconnect === 'function') {
        await Promise.resolve(_connection.disconnect()).catch(() => undefined);
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'unknown_error';
    warn('[QUEUE] Falha ao encerrar filas (ignorado em teardown):', errMsg);
  } finally {
    for (const k of Object.keys(_queueEvents)) delete _queueEvents[k];
    for (const k of Object.keys(_dlqQueues)) delete _dlqQueues[k];
    for (const k of Object.keys(_queues)) delete _queues[k];
    for (const k of Object.keys(queueRegistry)) delete queueRegistry[k];
    _connection = null;
    _queueOptions = null;
    _initialized = false;
  }
}

// Exportar filas como getters lazy
function lazyQueueProxy(name: string): BullQueue {
  return new Proxy({} as BullQueue, {
    get(_, prop) {
      return Reflect.get(getOrCreateQueue(name), prop);
    },
  });
}

export const flowQueue = lazyQueueProxy('flow-jobs');
export const campaignQueue = lazyQueueProxy('campaign-jobs');
export const scraperQueue = lazyQueueProxy('scraper-jobs');
export const mediaQueue = lazyQueueProxy('media-jobs');
export const voiceQueue = lazyQueueProxy('voice-jobs');
export const autopilotQueue = lazyQueueProxy('autopilot-jobs');
export const memoryQueue = lazyQueueProxy('memory-jobs');
export const crmQueue = lazyQueueProxy('crm-jobs');
export const webhookQueue = lazyQueueProxy('webhook-jobs');
