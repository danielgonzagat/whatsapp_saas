import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

const OPENAI_PROBE_TIMEOUT_MS = 2_000;

@Injectable()
export class OpenAIHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(OpenAIHealthIndicator.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();
    const apiKey = this.config.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      const details = {
        event: 'openai_health.missing_key',
        message: 'OPENAI_API_KEY not configured',
        checkDurationMs: Date.now() - startedAt,
      };
      this.logger.warn('OpenAI key missing', JSON.stringify(details));
      throw new HealthCheckError('OpenAI key not configured', this.getStatus(key, false, details));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_PROBE_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OpenAI API returned ${response.status}: ${body.slice(0, 200)}`);
      }

      return this.getStatus(key, true, {
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : String(error);
      const event = message.includes('aborted')
        ? 'openai_health.timeout'
        : 'openai_health.api_error';

      this.logger.error(
        JSON.stringify({ event, message, checkDurationMs: Date.now() - startedAt }),
      );

      throw new HealthCheckError(
        'OpenAI API unreachable',
        this.getStatus(key, false, {
          event,
          message,
          checkDurationMs: Date.now() - startedAt,
        }),
      );
    }
  }
}
