import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkerRuntimeService {
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private lastCheckAt = 0;
  private lastKnownAvailability: boolean | null = null;

  constructor(private readonly config: ConfigService) {}

  async isAvailable(forceRefresh = false): Promise<boolean> {
    const override = String(
      this.config.get<string>('WORKER_FORCE_AVAILABLE') || '',
    )
      .trim()
      .toLowerCase();

    if (override === 'true') {
      return true;
    }

    if (override === 'false') {
      return false;
    }

    const cacheTtlMs = this.getCacheTtlMs();
    const now = Date.now();

    if (
      !forceRefresh &&
      this.lastKnownAvailability !== null &&
      now - this.lastCheckAt < cacheTtlMs
    ) {
      return this.lastKnownAvailability;
    }

    const available = await this.checkWorkerHealth();
    this.lastKnownAvailability = available;
    this.lastCheckAt = now;
    return available;
  }

  private async checkWorkerHealth(): Promise<boolean> {
    const workerHealthUrl =
      this.config.get<string>('WORKER_HEALTH_URL') ||
      this.config.get<string>('WORKER_METRICS_URL');
    const workerMetricsToken = this.config.get<string>('WORKER_METRICS_TOKEN');

    if (!workerHealthUrl) {
      return false;
    }

    const fetchFn = globalThis.fetch?.bind(globalThis);
    if (!fetchFn) {
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const response = await fetchFn(workerHealthUrl, {
        method: 'GET',
        headers: workerMetricsToken
          ? {
              Authorization: `Bearer ${workerMetricsToken}`,
            }
          : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        return false;
      }

      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== 'object') {
        return true;
      }

      const status = String((payload as Record<string, unknown>).status || '')
        .trim()
        .toLowerCase();

      if (!status) {
        return true;
      }

      return status === 'ok' || status === 'up' || status === 'healthy';
    } catch (error: any) {
      this.logger.warn(
        `Worker health check failed: ${error?.message || 'unknown_error'}`,
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getCacheTtlMs(): number {
    return Math.max(
      5000,
      parseInt(process.env.WORKER_HEALTH_CACHE_MS || '15000', 10) || 15000,
    );
  }

  private getTimeoutMs(): number {
    return Math.max(
      500,
      parseInt(process.env.WORKER_HEALTH_TIMEOUT_MS || '1500', 10) || 1500,
    );
  }
}
