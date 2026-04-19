import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkerRuntimeService {
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private lastCheckAt = 0;
  private lastKnownAvailability: boolean | null = null;

  constructor(private readonly config: ConfigService) {}

  private readText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  async isAvailable(forceRefresh = false): Promise<boolean> {
    const override = this.readText(this.config.get<string>('WORKER_FORCE_AVAILABLE'))
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

  private buildWorkerHealthHeaders(): Record<string, string> | undefined {
    const token = this.config.get<string>('WORKER_METRICS_TOKEN');
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }

  private interpretWorkerHealthPayload(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return true;
    const status = this.readText((payload as Record<string, unknown>).status)
      .trim()
      .toLowerCase();
    if (!status) return true;
    return status === 'ok' || status === 'up' || status === 'healthy';
  }

  private async readWorkerHealthResponse(response: Response): Promise<boolean> {
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return this.interpretWorkerHealthPayload(payload);
  }

  private logWorkerHealthError(error: unknown): void {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string' && error
          ? error
          : 'unknown_error';
    this.logger.warn(`Worker health check failed: ${message}`);
  }

  private async checkWorkerHealth(): Promise<boolean> {
    const workerHealthUrl =
      this.config.get<string>('WORKER_HEALTH_URL') || this.config.get<string>('WORKER_METRICS_URL');
    if (!workerHealthUrl) return false;

    const fetchFn = globalThis.fetch?.bind(globalThis);
    if (!fetchFn) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const response = await fetchFn(workerHealthUrl, {
        method: 'GET',
        headers: this.buildWorkerHealthHeaders(),
        signal: controller.signal,
      });
      return await this.readWorkerHealthResponse(response);
    } catch (error: unknown) {
      this.logWorkerHealthError(error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getCacheTtlMs(): number {
    return Math.max(
      5000,
      Number.parseInt(process.env.WORKER_HEALTH_CACHE_MS || '15000', 10) || 15000,
    );
  }

  private getTimeoutMs(): number {
    return Math.max(
      500,
      Number.parseInt(process.env.WORKER_HEALTH_TIMEOUT_MS || '1500', 10) || 1500,
    );
  }
}
