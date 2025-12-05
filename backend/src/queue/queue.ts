import { Queue as BullQueue, Worker, Job, QueueEvents } from 'bullmq';
import {
  createRedisClient,
  getRedisUrl,
  maskRedisUrl,
} from '../common/redis/redis.util';

// ============================================================================
// LAZY INITIALIZATION - Conexão só é criada quando acessada pela primeira vez
// Isso garante que o bootstrap.ts já interceptou o ioredis antes da conexão
// ============================================================================

let _connection: ReturnType<typeof createRedisClient> | null = null;
let _queueOptions: any = null;
let _initialized = false;

function ensureInitialized() {
  if (_initialized) return;
  
  console.log('🔌 [QUEUE] Inicializando conexão Redis (lazy)...');
  const redisUrl = getRedisUrl();
  console.log('✅ [QUEUE] Conectando ao Redis:', maskRedisUrl(redisUrl));
  
  _connection = createRedisClient();
  
  const defaultAttempts = Math.max(
    1,
    parseInt(process.env.QUEUE_ATTEMPTS || '3', 10) || 3,
  );
  const defaultBackoff = Math.max(
    1000,
    parseInt(process.env.QUEUE_BACKOFF_MS || '5000', 10) || 5000,
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
  console.log('✅ [QUEUE] Conexão Redis inicializada');
}

// Getters para acesso lazy
export function getConnection() {
  ensureInitialized();
  return _connection!;
}

export function getQueueOptions() {
  ensureInitialized();
  return _queueOptions!;
}

// Aliases para compatibilidade
export const connection = new Proxy({} as ReturnType<typeof createRedisClient>, {
  get(_, prop) {
    return (getConnection() as any)[prop];
  },
});

export const queueOptions = new Proxy({} as any, {
  get(_, prop) {
    return getQueueOptions()[prop];
  },
});

export const queueRegistry: Record<string, BullQueue> = {};

async function notifyOps(input: {
  queue: string;
  jobId?: string | number;
  jobName?: string;
  reason?: string;
}) {
  const webhook = process.env.DLQ_WEBHOOK_URL || process.env.OPS_WEBHOOK_URL;
  if (!webhook) return;
  const isSlack = webhook.includes('hooks.slack.com');
  const isTeams = webhook.includes('office.com');
  const fetchFn = (global as any).fetch as
    | undefined
    | ((
        input: string,
        init?: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        },
      ) => Promise<any>);
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
                    value: String(
                      payload.jobName || payload.jobId || 'unknown',
                    ),
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
  } catch (err: any) {
    console.warn(
      `[DLQ] Falha ao notificar webhook (${webhook}):`,
      err?.message || err,
    );
  }
}

function attachDlq(queue: BullQueue) {
  const dlq = new BullQueue(`${queue.name}-dlq`, getQueueOptions());
  const events = new QueueEvents(queue.name, { connection: getConnection() });

  events.on('failed', (event) => {
    void (async () => {
      try {
        const job = await queue.getJob(event.jobId);
        if (!job) return;
        const opts = getQueueOptions();
        const maxAttempts =
          job.opts.attempts ?? opts.defaultJobOptions?.attempts ?? 1;
        // Só envia para DLQ após esgotar as tentativas
        if ((event as any).attemptsMade < maxAttempts) return;

        await dlq.add(
          'failed',
          {
            originalQueue: queue.name,
            jobName: job.name,
            data: job.data,
            opts: job.opts,
            failedReason: (event as any).failedReason,
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
          reason: (event as any).failedReason,
        });
      } catch (err: any) {
        console.error(
          `[DLQ] Falha ao mover job da fila ${queue.name}:`,
          err?.message || err,
        );
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
    console.log(`📦 [QUEUE] Criando fila "${name}" (lazy)...`);
    _queues[name] = new BullQueue(name, getQueueOptions());
    attachDlq(_queues[name]);
    queueRegistry[name] = _queues[name];
  }
  return _queues[name];
}

// Exportar filas como getters lazy
export const flowQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('flow-jobs') as any)[prop];
  },
});

export const campaignQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('campaign-jobs') as any)[prop];
  },
});

export const scraperQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('scraper-jobs') as any)[prop];
  },
});

export const mediaQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('media-jobs') as any)[prop];
  },
});

export const voiceQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('voice-jobs') as any)[prop];
  },
});

export const autopilotQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('autopilot-jobs') as any)[prop];
  },
});

export const memoryQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('memory-jobs') as any)[prop];
  },
});

export const crmQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('crm-jobs') as any)[prop];
  },
});

export const webhookQueue = new Proxy({} as BullQueue, {
  get(_, prop) {
    return (getOrCreateQueue('webhook-jobs') as any)[prop];
  },
});

export class Queue {
  private queue: BullQueue;
  private name: string;

  constructor(name: string) {
    this.name = name;
    this.queue = new BullQueue(name, getQueueOptions());
  }

  async push(data: any, opts?: any) {
    return this.queue.add('default', data, opts);
  }

  on(event: 'job', callback: (job: any) => Promise<void>) {
    if (event === 'job') {
      new Worker(
        this.name,
        async (job: Job) => {
          await callback(job.data);
        },
        { connection: getConnection() },
      );
    }
  }
}
