import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

const META_PROBE_TIMEOUT_MS = 2_000;

@Injectable()
export class MetaHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(MetaHealthIndicator.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');

    if (!appId || !appSecret) {
      const details = {
        event: 'meta_health.missing_credentials',
        message: 'META_APP_ID or META_APP_SECRET not configured',
        checkDurationMs: Date.now() - startedAt,
      };
      this.logger.warn('Meta credentials missing', JSON.stringify(details));
      throw new HealthCheckError(
        'Meta credentials not configured',
        this.getStatus(key, false, details),
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), META_PROBE_TIMEOUT_MS);

    try {
      const token = `${appId}|${appSecret}`;
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${appId}?access_token=${encodeURIComponent(token)}&fields=id`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Meta Graph API returned ${response.status}: ${body.slice(0, 200)}`);
      }

      return this.getStatus(key, true, {
        appId: `${appId.slice(0, 4)}...`,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : String(error);
      const event = message.includes('aborted') ? 'meta_health.timeout' : 'meta_health.api_error';

      this.logger.error(
        JSON.stringify({ event, message, checkDurationMs: Date.now() - startedAt }),
      );

      throw new HealthCheckError(
        'Meta API unreachable',
        this.getStatus(key, false, {
          event,
          message,
          checkDurationMs: Date.now() - startedAt,
        }),
      );
    }
  }
}
