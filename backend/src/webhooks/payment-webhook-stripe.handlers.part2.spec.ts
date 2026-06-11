import { describe, expect, it } from '@jest/globals';

import {
  handleRefundCreated,
  handleDisputeClosed,
  handlePayoutEvent,
} from './payment-webhook-stripe.handlers';
import {
  asDeps,
  makeDisputeClosedEvent,
  makePayoutEvent,
  makeRefundEvent,
  mockDeps,
} from './payment-webhook-stripe.handlers.fixtures';

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
