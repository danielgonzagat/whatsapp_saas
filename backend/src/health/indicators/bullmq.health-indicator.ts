import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { connection } from '../../queue/queue';

@Injectable()
export class BullMQHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const redis = connection;
      await redis.ping();
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'BullMQ check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
