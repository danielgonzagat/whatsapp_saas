import { Injectable, Logger } from '@nestjs/common';
// Queue health service only reads queue state — no jobs enqueued, deduplication not applicable.
import { Queue } from 'bullmq';
import {
  autopilotQueue,
  campaignQueue,
  connection,
  crmQueue,
  flowQueue,
  mediaQueue,
  memoryQueue,
  queueOptions,
  scraperQueue,
  voiceQueue,
} from '../queue/queue';

const qhLogger = new Logger('QueueHealthService');
// Log para confirmar que conexão Redis está correta
if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
  qhLogger.log('Usando conexão Redis compartilhada do queue.ts');
}

export type QueueSummary = {
  name: string;
  main: Record<string, number>;
  dlq: Record<string, number>;
  threshold?: number;
};

@Injectable()
export class QueueHealthService {
  private readonly queues: Queue[];
  private readonly threshold: number;

  constructor() {
    this.queues = [
      flowQueue,
      campaignQueue,
      scraperQueue,
      mediaQueue,
      voiceQueue,
      autopilotQueue,
      memoryQueue,
      crmQueue,
    ];
    this.threshold = Number(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || 200) || 200;
  }

  async getQueuesStatus(): Promise<QueueSummary[]> {
    const results: QueueSummary[] = [];

    // biome-ignore lint/performance/noAwaitInLoops: sequential queue metrics collection with DLQ creation
    for (const queue of this.queues) {
      // IMPORTANTE: usar queueOptions com connection explícita, não queue.opts
      const dlq = new Queue(`${queue.name}-dlq`, {
        ...queueOptions,
        connection,
      });
      // biome-ignore lint/performance/noAwaitInLoops: queue metrics aggregated with internal Promise.all; outer loop iterates queue names
      const [mainCounts, dlqCounts] = await Promise.all([
        queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
        dlq.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      ]);

      results.push({
        name: queue.name,
        main: mainCounts,
        dlq: dlqCounts,
        threshold: this.threshold,
      });
    }

    return results;
  }
}
