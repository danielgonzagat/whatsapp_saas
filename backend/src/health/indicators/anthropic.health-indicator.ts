import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { CANONICAL_MODEL_IDS } from '../../lib/openai-models';

const ANTHROPIC_PROBE_TIMEOUT_MS = 2_000;

@Injectable()
export class AnthropicHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(AnthropicHealthIndicator.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');

    if (!apiKey) {
      const details = {
        event: 'anthropic_health.missing_key',
        message: 'ANTHROPIC_API_KEY not configured',
        checkDurationMs: Date.now() - startedAt,
      };
      this.logger.warn('Anthropic key missing', JSON.stringify(details));
      throw new HealthCheckError(
        'Anthropic key not configured',
        this.getStatus(key, false, details),
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANTHROPIC_PROBE_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: CANONICAL_MODEL_IDS.anthropicHealthProbe,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Anthropic API returned ${response.status}: ${body.slice(0, 200)}`);
      }

      return this.getStatus(key, true, {
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : String(error);
      const event = message.includes('aborted')
        ? 'anthropic_health.timeout'
        : 'anthropic_health.api_error';

      this.logger.error(
        JSON.stringify({ event, message, checkDurationMs: Date.now() - startedAt }),
      );

      throw new HealthCheckError(
        'Anthropic API unreachable',
        this.getStatus(key, false, {
          event,
          message,
          checkDurationMs: Date.now() - startedAt,
        }),
      );
    }
  }
}
