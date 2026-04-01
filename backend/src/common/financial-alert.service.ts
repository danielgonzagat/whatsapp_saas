import { Injectable, Logger } from '@nestjs/common';

/**
 * Centralised alerting for financial operations.
 * Logs structured FINANCIAL_ALERT messages and forwards to Sentry
 * when available. Designed to be injected into any service that
 * handles payments, withdrawals, or webhook processing.
 */
@Injectable()
export class FinancialAlertService {
  private readonly logger = new Logger('FinancialAlert');

  paymentFailed(
    error: Error,
    context: {
      workspaceId?: string;
      orderId?: string;
      amount?: number;
      gateway?: string;
    },
  ) {
    this.logger.error(
      `FINANCIAL_ALERT: Payment failed — workspace=${context.workspaceId} order=${context.orderId} amount=${context.amount} gateway=${context.gateway}: ${error.message}`,
      error.stack,
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node');
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', gateway: context.gateway },
        extra: context,
        level: 'fatal',
      });
    } catch {
      // Sentry not available — structured log above is the fallback
    }
  }

  withdrawalFailed(
    error: Error,
    context: { workspaceId?: string; amount?: number },
  ) {
    this.logger.error(
      `FINANCIAL_ALERT: Withdrawal failed — workspace=${context.workspaceId} amount=${context.amount}: ${error.message}`,
      error.stack,
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node');
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', operation: 'withdrawal' },
        extra: context,
        level: 'fatal',
      });
    } catch {
      // Sentry not available
    }
  }

  webhookProcessingFailed(
    error: Error,
    context: {
      provider?: string;
      externalId?: string;
      eventType?: string;
    },
  ) {
    this.logger.error(
      `FINANCIAL_ALERT: Webhook processing failed — provider=${context.provider} externalId=${context.externalId} event=${context.eventType}: ${error.message}`,
      error.stack,
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node');
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', provider: context.provider },
        extra: context,
        level: 'error',
      });
    } catch {
      // Sentry not available
    }
  }

  reconciliationAlert(
    message: string,
    context: { workspaceId?: string; details?: any },
  ) {
    this.logger.warn(`FINANCIAL_ALERT: ${message}`, JSON.stringify(context));
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node');
      Sentry.captureMessage(`Financial reconciliation: ${message}`, {
        tags: { type: 'financial_alert', operation: 'reconciliation' },
        extra: context,
        level: 'warning',
      });
    } catch {
      // Sentry not available
    }
  }
}
