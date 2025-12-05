import { Queue as BullQueue, Worker, Job, QueueEvents } from "bullmq";
import Redis from "ioredis";

// ========================================
// CONSTRUIR REDIS_URL SE NECESSÁRIO
// ========================================
function buildRedisUrlFromComponents(): string | undefined {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME ?? process.env.REDIS_USER;
  
  if (!host) return undefined;
  
  const auth = username && password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : password
      ? `${encodeURIComponent(password)}@`
      : '';
  
  return `redis://${auth}${host}:${port}`;
}

console.log('========================================');
console.log('🔍 [WORKER/QUEUE] Verificando configuração Redis...');

let redisUrl: string | undefined = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn('⚠️  [QUEUE] REDIS_URL não definida, tentando REDIS_HOST/PORT...');
  redisUrl = buildRedisUrlFromComponents();
  
  if (redisUrl) {
    const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');
    console.warn('⚠️  [QUEUE] URL construída de REDIS_HOST/PORT:', maskedUrl);
  } else {
    console.error('❌ [QUEUE] REDIS_URL e REDIS_HOST não definidas!');
    console.error('📋 Configure REDIS_URL ou REDIS_HOST/REDIS_PORT');
    process.exit(1);
  }
}

if (redisUrl.includes('.railway.internal')) {
  console.error('❌ [QUEUE] REDIS_URL está usando hostname interno (.railway.internal)!');
  console.error('📋 Use a URL PÚBLICA do Redis.');
  process.exit(1);
}

if (redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1')) {
  console.warn('⚠️  [QUEUE] AVISO: REDIS_URL aponta para localhost!');
  console.warn('⚠️  Em containers/produção isso não funciona.');
}

// Mask password for logging
const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');
console.log('✅ [QUEUE] Conectando ao Redis:', maskedUrl);
console.log('========================================');

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

connection.on('error', (err) => {
  console.error('❌ [QUEUE] Redis error:', err.message);
});

connection.on('connect', () => {
  console.log('📡 [QUEUE] Conectado ao Redis');
});

connection.on('ready', () => {
  console.log('✅ [QUEUE] Redis pronto para comandos');
});

const defaultAttempts = Math.max(
  1,
  parseInt(process.env.QUEUE_ATTEMPTS || "3", 10) || 3
);
const defaultBackoff = Math.max(
  1000,
  parseInt(process.env.QUEUE_BACKOFF_MS || "5000", 10) || 5000
);

const queueOptions = {
  connection,
  defaultJobOptions: {
    attempts: defaultAttempts,
    backoff: { type: "exponential", delay: defaultBackoff },
    removeOnComplete: true,
    removeOnFail: 50,
  },
};

async function notifyOps(input: {
  queue: string;
  jobId?: string | number;
  jobName?: string;
  reason?: string;
}) {
  const webhook = process.env.DLQ_WEBHOOK_URL || process.env.OPS_WEBHOOK_URL;
  if (!webhook) return;
  const isSlack = webhook.includes("hooks.slack.com");
  const isTeams = webhook.includes("office.com");
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
      type: "dlq_event",
      queue: input.queue,
      jobId: input.jobId,
      jobName: input.jobName,
      reason: input.reason,
      env: process.env.NODE_ENV || "dev",
      at: new Date().toISOString(),
    };

    const body = isSlack
      ? {
          text: `DLQ ${payload.queue} -> job ${payload.jobName || payload.jobId || "unknown"} (${payload.reason || "no reason"}) [${payload.env}]`,
        }
      : isTeams
        ? {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            summary: "DLQ Event",
            themeColor: "E53935",
            title: `DLQ ${payload.queue}`,
            sections: [
              {
                facts: [
                  {
                    name: "Job",
                    value: String(payload.jobName || payload.jobId || "unknown"),
                  },
                  { name: "Reason", value: payload.reason || "n/a" },
                  { name: "Env", value: payload.env },
                  { name: "At", value: payload.at },
                ],
              },
            ],
          }
        : payload;

    await fetchFn(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    console.warn(
      `[DLQ] Falha ao notificar webhook (${webhook}):`,
      err?.message || err
    );
  }
}

function attachDlq(queue: BullQueue) {
  const dlq = new BullQueue(`${queue.name}-dlq`, queueOptions);
  const events = new QueueEvents(queue.name, { connection });

  events.on("failed", (event) => {
    void (async () => {
      const { jobId, failedReason, attemptsMade } = event as any;
      try {
        const job = await queue.getJob(jobId);
        if (!job) return;
        const maxAttempts =
          job.opts.attempts ?? queueOptions.defaultJobOptions?.attempts ?? 1;
        if (attemptsMade < maxAttempts) return;

        await dlq.add(
          "failed",
          {
            originalQueue: queue.name,
            jobName: job.name,
            data: job.data,
            opts: job.opts,
            failedReason,
            failedAt: new Date().toISOString(),
          },
          { jobId: job.id, removeOnComplete: true }
        );
        await notifyOps({
          queue: queue.name,
          jobId: job.id ?? undefined,
          jobName: job.name,
          reason: failedReason,
        });
      } catch (err: any) {
        console.error(
          `[DLQ] Falha ao mover job ${jobId} da fila ${queue.name}:`,
          err?.message || err
        );
      }
    })();
  });
}

export const flowQueue = new BullQueue("flow-jobs", queueOptions);
attachDlq(flowQueue);
export const campaignQueue = new BullQueue("campaign-jobs", queueOptions);
attachDlq(campaignQueue);
export const scraperQueue = new BullQueue("scraper-jobs", queueOptions);
attachDlq(scraperQueue);
export const mediaQueue = new BullQueue("media-jobs", queueOptions);
attachDlq(mediaQueue);
export const voiceQueue = new BullQueue("voice-jobs", queueOptions);
attachDlq(voiceQueue);
export const memoryQueue = new BullQueue("memory-jobs", queueOptions);
attachDlq(memoryQueue);
export const crmQueue = new BullQueue("crm-jobs", queueOptions);
attachDlq(crmQueue);
export const autopilotQueue = new BullQueue("autopilot-jobs", queueOptions);
attachDlq(autopilotQueue);
export const webhookQueue = new BullQueue("webhook-jobs", queueOptions);
attachDlq(webhookQueue);

export { queueOptions };

export const queueRegistry = [
  flowQueue,
  campaignQueue,
  scraperQueue,
  mediaQueue,
  voiceQueue,
  memoryQueue,
  crmQueue,
  autopilotQueue,
  webhookQueue
];

export class Queue {
  private queue: BullQueue;
  private name: string;

  constructor(name: string) {
    this.name = name;
    this.queue = new BullQueue(name, queueOptions);
  }

  async push(data: any, opts?: any) {
    return this.queue.add("default", data, opts);
  }

  on(event: "job", callback: (job: any) => Promise<void>) {
    if (event === "job") {
      new Worker(this.name, async (job: Job) => {
        await callback(job.data);
      }, { connection });
    }
  }
}
