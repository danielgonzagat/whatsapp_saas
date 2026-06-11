import { describe, expect, it } from '@jest/globals';

import { handleRefundCreated, handleDisputeCreated } from './payment-webhook-stripe.handlers';
import {
  asDeps,
  makeDisputeCreatedEvent,
  makeRefundEvent,
  mockDeps,
} from './payment-webhook-stripe.handlers.fixtures';

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
