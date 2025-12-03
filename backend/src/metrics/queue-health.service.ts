import { Injectable } from '@nestjs/common';
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
} from '../queue/queue';

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
      const dlq = new Queue(`${queue.name}-dlq`, queue.opts);
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
