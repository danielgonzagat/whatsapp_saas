import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { StripeService } from '../../billing/stripe.service';

@Injectable()
export class StripeHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(StripeHealthIndicator.name);
  private readonly timeoutMs = 5_000;
  private readonly maxAttempts = 3;

  constructor(private readonly stripeService: StripeService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();

    try {
      const balance = await this.executeWithRetry(
        () => this.withTimeout(this.stripeService.retrieveBalance()),
        'retrieveBalance',
      );

      this.logger.log(
        JSON.stringify({
          event: 'stripe_health.check_ok',
          durationMs: Date.now() - startedAt,
          livemode: balance.livemode,
        }),
      );
      return this.getStatus(key, true, {
        mode: balance.livemode ? 'live' : 'test',
        pendingAmount: balance.pending?.length ?? 0,
        availableAmount: balance.available?.length ?? 0,
        checkDurationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const context = {
        event: 'stripe_health.check_failed',
        operation: 'retrieveBalance',
        durationMs: Date.now() - startedAt,
        message,
      };
      this.logger.error(`Stripe health check failed`, JSON.stringify(context));

      throw new HealthCheckError('Stripe API unreachable', this.getStatus(key, false, context));
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`stripe_health.timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        if (attempt > 1) {
          this.logger.warn(
            JSON.stringify({
              event: 'stripe_health.retry',
              operation: operationName,
              attempt,
            }),
          );
        }
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      }
    }

    this.logger.error(
      JSON.stringify({
        event: 'stripe_health.retry_exhausted',
        operation: operationName,
        attempts: this.maxAttempts,
        message: lastError instanceof Error ? lastError.message : String(lastError),
      }),
    );
    throw lastError;
  }
}
