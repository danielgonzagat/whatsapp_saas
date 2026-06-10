import { jest } from '@jest/globals';

import { type StripeHandlerDeps } from './payment-webhook-stripe.handlers';

type TransactionInput = ((tx: unknown) => Promise<unknown>) | Array<Promise<unknown>>;

export function mockDeps() {
  return {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    prisma: {
      $transaction: jest.fn((arg: TransactionInput) =>
        typeof arg === 'function' ? arg(undefined) : Promise.all(arg),
      ),
      checkoutPayment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      checkoutOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      connectAccountBalance: { findUnique: jest.fn() },
    },
    autopilot: {},
    whatsapp: { sendMessage: jest.fn() },
    webhooksService: {
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
      logWebhookEvent: jest.fn(),
    },
    stripeWebhookProcessor: {},
    connectReversalService: {
      processRefund: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_test_123',
        triggerId: 're_1',
        reversedAmountCents: 9_010n,
        reversedTransfers: 2,
        ledgerDebits: 2,
      }),
      processDispute: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_test_123',
        triggerId: 'dp_1',
        reversedAmountCents: 9_010n,
        reversedTransfers: 3,
        ledgerDebits: 3,
      }),
    },
    connectPayoutService: { handleFailedPayout: jest.fn() },
    marketplaceTreasuryPayoutService: { handleFailedPayout: jest.fn() },
    adminAudit: { append: jest.fn().mockResolvedValue(undefined) },
    financialAlert: { webhookProcessingFailed: jest.fn() },
    ledger: {
      loadCheckoutPaymentContext: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        order: { workspaceId: 'ws-1' },
      }),
      appendMarketplaceTreasuryReversal: jest.fn().mockResolvedValue(undefined),
      appendSaleReversalAudit: jest.fn().mockResolvedValue(undefined),
      appendConnectPayoutAudit: jest.fn().mockResolvedValue(undefined),
      appendMarketplaceTreasuryPayoutAudit: jest.fn().mockResolvedValue(undefined),
    },
  };
}

export type MockDeps = ReturnType<typeof mockDeps>;

export function asDeps(deps: MockDeps): StripeHandlerDeps {
  // Repo test-harness convention (`as never`): fixtures mirror the spec surface.
  return deps as never;
}

export function makeRefundEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_refund_1',
    type: 'refund.created',
    data: {
      object: { id: 're_1', payment_intent: 'pi_test_123', amount: 13_990, ...overrides },
    },
  };
}

export function makeDisputeCreatedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_dispute_1',
    type: 'charge.dispute.created',
    data: {
      object: { id: 'dp_1', payment_intent: 'pi_test_123', amount: 13_990, ...overrides },
    },
  };
}

export function makeDisputeClosedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_dispute_closed_1',
    type: 'charge.dispute.closed',
    data: {
      object: {
        id: 'dp_1',
        payment_intent: 'pi_test_123',
        amount: 13_990,
        status: 'won',
        ...overrides,
      },
    },
  };
}

export function makePayoutEvent(
  eventType: string,
  overrides: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
) {
  return {
    id: 'evt_payout_1',
    type: eventType,
    data: {
      object: {
        id: 'po_1',
        amount: 9_010,
        status: eventType === 'payout.failed' ? 'failed' : 'paid',
        metadata: {
          accountBalanceId: 'cab_1',
          requestId: 'req_1',
          ...metadata,
        },
        ...overrides,
      },
    },
  };
}
