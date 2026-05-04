import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { connection, queueRegistry } from '../../queue/queue';

@Injectable()
export class BullMQHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const redis = connection;
      await redis.ping();

      const queueNames = Object.keys(queueRegistry);
      let totalWaiting = 0;
      let totalFailed = 0;

      for (const name of queueNames) {
        try {
          const counts = await queueRegistry[name].getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
          );
          totalWaiting += counts.waiting ?? 0;
          totalFailed += counts.failed ?? 0;
        } catch {
          /* individual queue stats are best-effort */
        }
      }

      return this.getStatus(key, true, {
        connection: 'UP',
        queueCount: queueNames.length,
        waiting: totalWaiting,
        failed: totalFailed,
      });
    } catch (error) {
      throw new HealthCheckError(
        'BullMQ check failed',
        this.getStatus(key, false, {
          message: (error as Error).message,
          connection: 'DOWN',
        }),
      );
    }
  }
}
