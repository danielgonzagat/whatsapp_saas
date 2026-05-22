import { FinancialAlertService } from './financial-alert.service';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

import * as Sentry from '@sentry/node';

describe('FinancialAlertService', () => {
  let service: FinancialAlertService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinancialAlertService();
  });

  it('paymentFailed forwards to Sentry as fatal with financial_alert tag', () => {
    const err = new Error('boom');
    service.paymentFailed(err, {
      workspaceId: 'ws-1',
      orderId: 'o-1',
      amount: 1234,
      gateway: 'stripe',
    });
    const [, sentryContext] = (Sentry.captureException as jest.Mock).mock.calls[0] as [
      Error,
      {
        tags: { type: string; gateway: string };
        level: string;
        extra: { workspaceId: string; orderId: string };
      },
    ];
    expect(Sentry.captureException).toHaveBeenCalledWith(err, sentryContext);
    expect(sentryContext.tags).toEqual({ type: 'financial_alert', gateway: 'stripe' });
    expect(sentryContext.level).toBe('fatal');
    expect(sentryContext.extra.workspaceId).toBe('ws-1');
    expect(sentryContext.extra.orderId).toBe('o-1');
  });

  it('withdrawalFailed forwards as fatal with operation=withdrawal', () => {
    const error = new Error('x');
    service.withdrawalFailed(error, { workspaceId: 'ws-2', amount: 100 });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { type: 'financial_alert', operation: 'withdrawal' },
        level: 'fatal',
      }),
    );
  });

  it('webhookProcessingFailed forwards as error with provider tag', () => {
    const error = new Error('y');
    service.webhookProcessingFailed(error, {
      provider: 'stripe',
      externalId: 'evt_1',
      eventType: 'invoice.paid',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { type: 'financial_alert', provider: 'stripe' },
        level: 'error',
      }),
    );
  });

  it('reconciliationAlert sends a captureMessage at warning level', () => {
    service.reconciliationAlert('mismatch', { workspaceId: 'ws-1' });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('mismatch'),
      expect.objectContaining({ level: 'warning' }),
    );
  });
});
