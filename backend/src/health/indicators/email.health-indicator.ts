import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

type EmailProvider = 'resend' | 'sendgrid' | 'smtp' | 'log';

const EMAIL_PROVIDER_TIMEOUT_MS = 3_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 100;

@Injectable()
export class EmailHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(EmailHealthIndicator.name);

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();
    const provider = this.resolveProvider();
    const configured = provider !== 'log';

    if (!configured) {
      const details = {
        event: 'email_health.provider_missing',
        provider: 'none',
        message: 'No email provider configured (RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST)',
        checkDurationMs: Date.now() - startedAt,
      };

      this.logger.error('Email provider not configured', JSON.stringify(details));

      throw new HealthCheckError(
        'Email provider not configured',
        this.getStatus(key, false, details),
      );
    }

    try {
      const connectivity = await this.checkConnectivityWithRetry(provider);
      const payload = {
        provider,
        connectivity: connectivity.details,
        attempts: connectivity.attempts,
        checkDurationMs: Date.now() - startedAt,
      };

      if (!connectivity.healthy) {
        this.logger.warn(
          'Email provider connectivity unhealthy',
          JSON.stringify({ event: 'email_health.connectivity_unhealthy', ...payload }),
        );
      }

      return this.getStatus(key, connectivity.healthy, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = {
        event: 'email_health.connectivity_failed',
        provider,
        message,
        checkDurationMs: Date.now() - startedAt,
      };

      this.logger.error('Email provider connectivity failed', JSON.stringify(details));

      return this.getStatus(key, false, {
        ...details,
      });
    }
  }

  private resolveProvider(): EmailProvider {
    if (process.env.RESEND_API_KEY?.trim()) {
      return 'resend';
    }

    if (process.env.SENDGRID_API_KEY?.trim()) {
      return 'sendgrid';
    }

    if (process.env.SMTP_HOST?.trim()) {
      return 'smtp';
    }

    return 'log';
  }

  private async checkConnectivityWithRetry(
    provider: EmailProvider,
  ): Promise<{ healthy: boolean; details: string; attempts: number }> {
    let lastError = 'unknown';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.checkConnectivity(provider, attempt);
        return { ...result, attempts: attempt };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'unknown';

        if (attempt < MAX_ATTEMPTS) {
          const delayMs = BACKOFF_BASE_MS * attempt;
          this.logger.warn(
            JSON.stringify({
              event: 'email_health.retry',
              provider,
              attempt,
              nextDelayMs: delayMs,
              message: lastError,
            }),
          );

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }
    }

    this.logger.error(
      JSON.stringify({
        event: 'email_health.retry_exhausted',
        provider,
        attempts: MAX_ATTEMPTS,
        message: lastError,
      }),
    );

    return {
      healthy: false,
      details: lastError,
      attempts: MAX_ATTEMPTS,
    };
  }

  private async checkConnectivity(
    provider: EmailProvider,
    attempt: number,
  ): Promise<{ healthy: boolean; details: string }> {
    switch (provider) {
      case 'resend': {
        const response = await this.fetchWithTimeout('https://api.resend.com/emails', {
          method: 'HEAD',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          timeoutMs: EMAIL_PROVIDER_TIMEOUT_MS,
          provider,
          attempt,
        });

        return {
          healthy: response.ok || response.status === 401,
          details: `HTTP ${response.status}`,
        };
      }

      case 'sendgrid': {
        const response = await this.fetchWithTimeout('https://api.sendgrid.com/v3/scopes', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          },
          timeoutMs: EMAIL_PROVIDER_TIMEOUT_MS,
          provider,
          attempt,
        });

        return {
          healthy: response.ok,
          details: `HTTP ${response.status}`,
        };
      }

      case 'smtp': {
        const host = process.env.SMTP_HOST?.trim();
        const port = Number(process.env.SMTP_PORT) || 587;
        const configured = Boolean(host);
        return {
          healthy: configured,
          details: configured ? `${host}:${port}` : 'SMTP_HOST missing',
        };
      }

      default:
        return { healthy: false, details: 'no provider' };
    }
  }

  private async fetchWithTimeout(
    url: string,
    config: {
      method: 'HEAD' | 'GET';
      headers: Record<string, string | undefined>;
      timeoutMs: number;
      provider: EmailProvider;
      attempt: number;
    },
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: config.method,
        headers: config.headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      this.logger.log(
        JSON.stringify({
          event: 'email_health.http_ok',
          provider: config.provider,
          attempt: config.attempt,
          status: response.status,
          providerUrl: this.maskUrl(url),
        }),
      );

      return response;
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : 'unknown';
      const event = message.includes('aborted')
        ? 'email_health.http_timeout'
        : 'email_health.http_error';

      if (event === 'email_health.http_timeout') {
        this.logger.error(
          JSON.stringify({
            event,
            provider: config.provider,
            attempt: config.attempt,
            timeoutMs: config.timeoutMs,
            message,
          }),
        );
      } else {
        this.logger.warn(
          JSON.stringify({
            event,
            provider: config.provider,
            attempt: config.attempt,
            message,
          }),
        );
      }

      throw error;
    }
  }

  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return 'invalid-url';
    }
  }
}
