import { describe, expect, it, jest } from '@jest/globals';

import {
  handleRefundCreated,
  handleDisputeCreated,
  handleDisputeClosed,
  handlePayoutEvent,
  type StripeHandlerDeps,
} from './payment-webhook-stripe.handlers';

type TransactionInput = ((tx: unknown) => Promise<unknown>) | Array<Promise<unknown>>;

function mockDeps() {
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

type MockDeps = ReturnType<typeof mockDeps>;

function asDeps(deps: MockDeps): StripeHandlerDeps {
  return deps as unknown as StripeHandlerDeps;
}

function makeRefundEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_refund_1',
    type: 'refund.created',
    data: {
      object: { id: 're_1', payment_intent: 'pi_test_123', amount: 13_990, ...overrides },
    },
  };
}

function makeDisputeCreatedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_dispute_1',
    type: 'charge.dispute.created',
    data: {
      object: { id: 'dp_1', payment_intent: 'pi_test_123', amount: 13_990, ...overrides },
    },
  };
}

function makeDisputeClosedEvent(overrides: Record<string, unknown> = {}) {
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

function makePayoutEvent(
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

describe('handleRefundCreated', () => {
  it('processes a refund, updates checkout state, and appends ledger entries', async () => {
    const deps = mockDeps();
    const event = makeRefundEvent();

    await handleRefundCreated(asDeps(deps), event, { id: 'we_1' } as never);

    expect(deps.connectReversalService.processRefund).toHaveBeenCalledWith({
      paymentIntentId: 'pi_test_123',
      refundId: 're_1',
      amountCents: 13_990n,
    });
    expect(deps.prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: { status: 'REFUNDED' },
    });
    expect(deps.prisma.checkoutOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'REFUNDED', refundedAt: expect.any(Date) },
    });
    expect(deps.prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_test_123' },
      data: { status: 'refunded' },
    });
    expect(deps.ledger.appendMarketplaceTreasuryReversal).toHaveBeenCalledWith({
      triggerKind: 'refund',
      triggerId: 're_1',
      paymentIntentId: 'pi_test_123',
      requestedAmountCents: 13_990n,
      stakeholderReversedAmountCents: 9_010n,
      marketplaceDebitCents: 4_980n,
    });
    expect(deps.ledger.appendSaleReversalAudit).toHaveBeenCalledWith({
      action: 'system.sale.refund_processed',
      paymentIntentId: 'pi_test_123',
      orderId: 'order-1',
      workspaceId: 'ws-1',
      triggerId: 're_1',
      requestedAmountCents: 13_990n,
      stakeholderReversedAmountCents: 9_010n,
      marketplaceDebitCents: 4_980n,
    });
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
  });

  it('no-ops gracefully for unknown payment intent (no checkout context)', async () => {
    const deps = mockDeps();
    deps.ledger.loadCheckoutPaymentContext.mockResolvedValue(null);
    const event = makeRefundEvent();

    await handleRefundCreated(asDeps(deps), event, undefined);

    expect(deps.connectReversalService.processRefund).toHaveBeenCalled();
    expect(deps.prisma.checkoutPayment.updateMany).toHaveBeenCalled();
    expect(deps.prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
    expect(deps.prisma.kloelSale.updateMany).not.toHaveBeenCalled();
  });

  it('alerts and rethrows when processRefund fails', async () => {
    const deps = mockDeps();
    const error = new Error('refund failed');
    deps.connectReversalService.processRefund.mockRejectedValueOnce(error);
    const event = makeRefundEvent();

    await expect(handleRefundCreated(asDeps(deps), event, undefined)).rejects.toThrow(
      'refund failed',
    );
    expect(deps.financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(error, {
      provider: 'stripe',
      externalId: 'pi_test_123',
      eventType: 'refund.created',
    });
  });

  it('does not proceed when event has no refund id', async () => {
    const deps = mockDeps();
    const event = makeRefundEvent({ id: null });

    await handleRefundCreated(asDeps(deps), event, undefined);

    expect(deps.connectReversalService.processRefund).not.toHaveBeenCalled();
  });

  it('does not proceed when amount is 0n', async () => {
    const deps = mockDeps();
    const event = makeRefundEvent({ amount: 0 });

    await handleRefundCreated(asDeps(deps), event, undefined);

    expect(deps.connectReversalService.processRefund).not.toHaveBeenCalled();
  });

  it('marks webhook failed when markWebhookProcessed throws', async () => {
    const deps = mockDeps();
    const markError = new Error('mark failed');
    deps.webhooksService.markWebhookProcessed.mockRejectedValueOnce(markError);
    const event = makeRefundEvent();

    await handleRefundCreated(asDeps(deps), event, { id: 'we_1' } as never);

    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark webhook we_1 as processed: mark failed'),
    );
  });
});

describe('handleDisputeCreated', () => {
  it('processes a dispute, updates state, and appends ledger entries', async () => {
    const deps = mockDeps();
    const event = makeDisputeCreatedEvent();

    await handleDisputeCreated(asDeps(deps), event, { id: 'we_2' } as never);

    expect(deps.connectReversalService.processDispute).toHaveBeenCalledWith({
      paymentIntentId: 'pi_test_123',
      disputeId: 'dp_1',
      amountCents: 13_990n,
    });
    expect(deps.prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: { status: 'CHARGEBACK' },
    });
    expect(deps.ledger.appendMarketplaceTreasuryReversal).toHaveBeenCalledWith({
      triggerKind: 'dispute',
      triggerId: 'dp_1',
      paymentIntentId: 'pi_test_123',
      requestedAmountCents: 13_990n,
      stakeholderReversedAmountCents: 9_010n,
      marketplaceDebitCents: 4_980n,
    });
    expect(deps.ledger.appendSaleReversalAudit).toHaveBeenCalledWith({
      action: 'system.sale.chargeback_posted',
      paymentIntentId: 'pi_test_123',
      orderId: 'order-1',
      workspaceId: 'ws-1',
      triggerId: 'dp_1',
      requestedAmountCents: 13_990n,
      stakeholderReversedAmountCents: 9_010n,
      marketplaceDebitCents: 4_980n,
    });
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_2');
  });

  it('alerts and rethrows when processDispute fails', async () => {
    const deps = mockDeps();
    const error = new Error('dispute failed');
    deps.connectReversalService.processDispute.mockRejectedValueOnce(error);
    const event = makeDisputeCreatedEvent();

    await expect(handleDisputeCreated(asDeps(deps), event, undefined)).rejects.toThrow(
      'dispute failed',
    );
    expect(deps.financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(error, {
      provider: 'stripe',
      externalId: 'pi_test_123',
      eventType: 'charge.dispute.created',
    });
  });

  it('no-ops for missing dispute id', async () => {
    const deps = mockDeps();
    const event = makeDisputeCreatedEvent({ id: null });

    await handleDisputeCreated(asDeps(deps), event, undefined);

    expect(deps.connectReversalService.processDispute).not.toHaveBeenCalled();
  });
});

describe('handleDisputeClosed', () => {
  it('restores APPROVED/PAID state when dispute is won', async () => {
    const deps = mockDeps();
    const event = makeDisputeClosedEvent({ status: 'won' });

    await handleDisputeClosed(asDeps(deps), event, { id: 'we_3' } as never);

    expect(deps.ledger.appendSaleReversalAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.sale.dispute_won' }),
    );
    expect(deps.prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: { status: 'APPROVED' },
    });
    expect(deps.prisma.checkoutOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'PAID' },
    });
    expect(deps.prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_test_123' },
      data: { status: 'paid' },
    });
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_3');
  });

  it('logs audit but does not restore state when dispute is lost', async () => {
    const deps = mockDeps();
    const event = makeDisputeClosedEvent({ status: 'lost' });

    await handleDisputeClosed(asDeps(deps), event, { id: 'we_4' } as never);

    expect(deps.ledger.appendSaleReversalAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.sale.dispute_lost' }),
    );
    expect(deps.prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
  });

  it('no-ops for missing dispute id', async () => {
    const deps = mockDeps();
    const event = makeDisputeClosedEvent({ id: null });

    await handleDisputeClosed(asDeps(deps), event, undefined);

    expect(deps.ledger.appendSaleReversalAudit).not.toHaveBeenCalled();
  });
});

describe('handlePayoutEvent', () => {
  it('handles payout.failed for a connect payout (has accountBalanceId)', async () => {
    const deps = mockDeps();
    const event = makePayoutEvent(
      'payout.failed',
      {},
      { accountBalanceId: 'cab_1', requestId: 'req_1' },
    );

    await handlePayoutEvent(asDeps(deps), event, { id: 'we_5' } as never, 'stripe_ext_1');

    expect(deps.connectPayoutService.handleFailedPayout).toHaveBeenCalledWith({
      payoutId: 'po_1',
      accountBalanceId: 'cab_1',
      requestId: 'req_1',
      amountCents: 9_010n,
    });
    expect(deps.ledger.appendConnectPayoutAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.connect.payout_failed', status: 'failed' }),
    );
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_5');
  });

  it('handles payout.failed for marketplace treasury payout (no accountBalanceId)', async () => {
    const deps = mockDeps();
    const event = makePayoutEvent(
      'payout.failed',
      {},
      { requestId: 'req_mt', marketplaceTreasury: 'true', marketplaceTreasuryCurrency: 'BRL' },
    );
    delete event.data.object.metadata.accountBalanceId;

    await handlePayoutEvent(asDeps(deps), event, { id: 'we_6' } as never, 'stripe_ext_2');

    expect(deps.marketplaceTreasuryPayoutService.handleFailedPayout).toHaveBeenCalledWith({
      payoutId: 'po_1',
      requestId: 'req_mt',
      amountCents: 9_010n,
      currency: 'BRL',
    });
    expect(deps.ledger.appendMarketplaceTreasuryPayoutAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.carteira.payout_failed', status: 'failed' }),
    );
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_6');
  });

  it('handles payout.paid for a connect payout', async () => {
    const deps = mockDeps();
    const event = makePayoutEvent(
      'payout.paid',
      {},
      { accountBalanceId: 'cab_1', requestId: 'req_1' },
    );

    await handlePayoutEvent(asDeps(deps), event, { id: 'we_7' } as never, 'stripe_ext_3');

    expect(deps.ledger.appendConnectPayoutAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.connect.payout_paid', status: 'paid' }),
    );
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_7');
  });

  it('handles payout.paid for marketplace treasury payout (no accountBalanceId)', async () => {
    const deps = mockDeps();
    const event = makePayoutEvent(
      'payout.paid',
      {},
      { requestId: 'req_mt', marketplaceTreasury: 'true', marketplaceTreasuryCurrency: 'BRL' },
    );
    delete event.data.object.metadata.accountBalanceId;

    await handlePayoutEvent(asDeps(deps), event, { id: 'we_8' } as never, 'stripe_ext_4');

    expect(deps.ledger.appendMarketplaceTreasuryPayoutAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'system.carteira.payout_paid', status: 'paid' }),
    );
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_8');
  });

  it('re-throws error and alerts when payout handling fails', async () => {
    const deps = mockDeps();
    const error = new Error('payout handling failed');
    deps.connectPayoutService.handleFailedPayout.mockRejectedValueOnce(error);
    const event = makePayoutEvent(
      'payout.failed',
      {},
      { accountBalanceId: 'cab_1', requestId: 'req_1' },
    );

    await expect(handlePayoutEvent(asDeps(deps), event, undefined, 'stripe_ext_5')).rejects.toThrow(
      'payout handling failed',
    );
    expect(deps.financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(error, {
      provider: 'stripe',
      externalId: 'po_1',
      eventType: 'payout.failed',
    });
  });

  it('no-ops when payout has no id', async () => {
    const deps = mockDeps();
    const event = makePayoutEvent('payout.paid', { id: null }, {});

    await handlePayoutEvent(asDeps(deps), event, undefined, 'stripe_ext_6');

    expect(deps.ledger.appendConnectPayoutAudit).not.toHaveBeenCalled();
    expect(deps.ledger.appendMarketplaceTreasuryPayoutAudit).not.toHaveBeenCalled();
  });
});

describe('workspace isolation — handlers', () => {
  it('handleRefundCreated for ws-A does not affect ws-B', async () => {
    const depsA = mockDeps();
    const depsB = mockDeps();
    const event = makeRefundEvent();

    await handleRefundCreated(asDeps(depsA), event, { id: 'we_a' } as never);

    expect(depsB.connectReversalService.processRefund).not.toHaveBeenCalled();
    expect(depsB.prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
  });
});
