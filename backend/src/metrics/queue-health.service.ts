import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  autopilotQueue,
  campaignQueue,
  flowQueue,
  mediaQueue,
  scraperQueue,
  voiceQueue,
  memoryQueue,
  crmQueue,
  queueOptions,
  connection,
} from '../queue/queue';

// Log para confirmar que conexão Redis está correta
if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
  console.log('✅ [QUEUE-HEALTH] Usando conexão Redis compartilhada do queue.ts');
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
    this.threshold =
      Number(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || 200) || 200;
  }

  async getQueuesStatus(): Promise<QueueSummary[]> {
    const results: QueueSummary[] = [];

    for (const queue of this.queues) {
      // IMPORTANTE: usar queueOptions com connection explícita, não queue.opts
      const dlq = new Queue(`${queue.name}-dlq`, { ...queueOptions, connection });
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
