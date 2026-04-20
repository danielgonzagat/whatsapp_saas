import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { connection, queueOptions, queueRegistry } from '../queue/queue';
// Health service only reads queue state — no jobs added, no jobId/deduplication needed.

const healthLogger = new Logger('HealthService');
// Log para confirmar que conexão Redis está correta
if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
  healthLogger.log('Usando conexão Redis compartilhada do queue.ts');
}

/** Health service. */
@Injectable()
export class HealthService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private async getQueueSnapshot() {
    const threshold = Number(process.env.AUTOPILOT_QUEUE_WAITING_THRESHOLD || 200) || 200;
    let totalWaiting = 0;
    let totalFailed = 0;
    let totalDlqWaiting = 0;
    let totalDlqFailed = 0;

    await forEachSequential(Object.values(queueRegistry), async (queue) => {
      const mainCounts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      const dlq = new Queue(`${queue.name}-dlq`, {
        ...queueOptions,
        connection,
      });
      const dlqCounts = await dlq.getJobCounts('waiting', 'active', 'delayed', 'failed');

      totalWaiting += mainCounts.waiting || 0;
      totalFailed += mainCounts.failed || 0;
      totalDlqWaiting += dlqCounts.waiting || 0;
      totalDlqFailed += dlqCounts.failed || 0;
    });

    const alert =
      totalWaiting > threshold || totalFailed > 0 || totalDlqWaiting > 0 || totalDlqFailed > 0;

    return {
      queue: {
        waiting: totalWaiting,
        failed: totalFailed,
        dlqWaiting: totalDlqWaiting,
        dlqFailed: totalDlqFailed,
        threshold,
      },
      queueAlert: alert,
    };
  }

  /** Get health. */
  async getHealth(workspaceId: string) {
    // Keys used by Worker's HealthMonitor
    const statusKey = `health:instance:${workspaceId}`;
    const metricsKey = `metrics:${workspaceId}`;

    const statusData = await this.redis.get(statusKey);
    const metricsList = await this.redis.lrange(metricsKey, 0, -1);

    let status = 'UNKNOWN';
    let lastCheck = 0;

    if (statusData) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(statusData);
      } catch {
        /* invalid JSON in Redis */
      }
      status = parsed.status as string;
      lastCheck = parsed.lastCheck as number;
    }

    let score = 100;
    let avgLatency = 0;

    if (metricsList.length > 0) {
      let successCount = 0;
      let totalLatency = 0;
      metricsList.forEach((e) => {
        const [ok, lat] = e.split(':');
        if (ok === '1') {
          successCount++;
        }
        totalLatency += Number(lat);
      });
      score = Math.round((successCount / metricsList.length) * 100);
      avgLatency = Math.round(totalLatency / metricsList.length);
    }

    // DB ping (leve)
    let dbOk = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    const queueSnapshot = await this.getQueueSnapshot();

    return {
      status,
      score,
      latency: avgLatency,
      lastCheck,
      db: dbOk ? 'up' : 'down',
      ...queueSnapshot,
    };
  }
}
