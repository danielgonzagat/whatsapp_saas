import { describe, expect, it, jest } from '@jest/globals';

import {
  handlePaymentIntentEvent,
  handleCheckoutSessionCompleted,
  type StripeHandlerDeps,
} from './payment-webhook-stripe.handlers2';

type TransactionInput = ((tx: unknown) => Promise<unknown>) | Array<Promise<unknown>>;

function mockDeps() {
  const txMethods = {
    checkoutOrder: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ status: 'PROCESSING', totalInCents: 13_990, metadata: {} }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    checkoutPayment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    prisma: {
      $transaction: jest.fn((arg: TransactionInput) => {
        if (typeof arg === 'function') {
          return arg(txMethods);
        }
        return Promise.all(arg);
      }),
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }) },
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      checkoutOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ status: 'PROCESSING', totalInCents: 13_990, metadata: {} }),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      kloelSale: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    },
    autopilot: {
      markConversion: jest.fn().mockResolvedValue(undefined),
      triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
    },
    whatsapp: { sendMessage: jest.fn().mockResolvedValue(undefined) },
    webhooksService: {
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
      markWebhookFailed: jest.fn().mockResolvedValue(undefined),
      logWebhookEvent: jest.fn(),
    },
    stripeWebhookProcessor: {
      processSaleSucceeded: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_sale_1',
        transfersDispatched: 4,
        ledgerEntriesCreated: 5,
        skippedReason: undefined,
        connectPostSale: {
          transferGroup: 'sale:order-1',
          sellerStripeAccountId: 'acct_seller',
          sellerDestinationAmountCents: 656n,
          transfers: [],
        },
      }),
    },
    connectReversalService: {},
    connectPayoutService: {},
    marketplaceTreasuryPayoutService: {},
    adminAudit: { append: jest.fn().mockResolvedValue(undefined) },
    financialAlert: { webhookProcessingFailed: jest.fn() },
    ledger: {
      buildMatureAtResolver: jest.fn().mockResolvedValue(() => new Date('2026-06-01')),
      persistConnectPostSaleSnapshot: jest.fn().mockResolvedValue(undefined),
      appendMarketplaceTreasurySaleCredit: jest.fn().mockResolvedValue(undefined),
      loadCheckoutPaymentContext: jest.fn().mockResolvedValue(null),
    },
  };
}

type MockDeps = ReturnType<typeof mockDeps>;

function asDeps(deps: MockDeps): StripeHandlerDeps {
  return deps as unknown as StripeHandlerDeps;
}

function makePaymentIntentEvent(
  eventType: string,
  overrides: Record<string, unknown> = {},
  metadata: Record<string, string | undefined> = {},
) {
  return {
    id: 'evt_pi_1',
    type: eventType,
    data: {
      object: {
        id: 'pi_test_123',
        status: eventType === 'payment_intent.succeeded' ? 'succeeded' : 'processing',
        metadata: { workspaceId: 'ws-1', orderId: 'order-1', ...metadata },
        ...overrides,
      },
    },
  };
}

function makeCheckoutSessionEvent(
  objOverrides: Record<string, unknown> = {},
  metadataOverrides: Record<string, string | undefined> = {},
) {
  return {
    id: 'evt_cs_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        payment_intent: 'pi_test_123',
        amount_total: 13_990,
        currency: 'brl',
        customer_email: 'test@example.com',
        customer_details: { email: 'test@example.com', phone: '+5511999999999' },
        metadata: { workspaceId: 'ws-1', productName: 'Curso X', ...metadataOverrides },
        ...objOverrides,
      },
    },
  };
}

describe('handlePaymentIntentEvent', () => {
  it('updates checkoutPayment status on payment_intent.succeeded (non-sale type)', async () => {
    const deps = mockDeps();
    const event = makePaymentIntentEvent('payment_intent.succeeded', {}, { type: 'checkout' });

    await handlePaymentIntentEvent(asDeps(deps), event, { id: 'we_1' } as never, 'stripe_ext_1');

    expect(deps.prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: expect.objectContaining({ status: 'APPROVED' }),
    });
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
  });

  it('processes a sale-type payment_intent via processSaleSucceeded', async () => {
    const deps = mockDeps();
    const event = makePaymentIntentEvent(
      'payment_intent.succeeded',
      {},
      { workspaceId: 'ws-1', orderId: 'order-1', type: 'sale' },
    );

    await handlePaymentIntentEvent(asDeps(deps), event, { id: 'we_2' } as never, 'stripe_ext_2');

    expect(deps.stripeWebhookProcessor.processSaleSucceeded).toHaveBeenCalled();
    expect(deps.ledger.persistConnectPostSaleSnapshot).toHaveBeenCalledWith(
      'pi_test_123',
      expect.any(Object),
    );
    expect(deps.ledger.appendMarketplaceTreasurySaleCredit).toHaveBeenCalledWith('pi_test_123');
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_2');
  });

  it('alerts and rethrows when processSaleSucceeded skips with reason', async () => {
    const deps = mockDeps();
    deps.stripeWebhookProcessor.processSaleSucceeded.mockResolvedValueOnce({
      skippedReason: 'duplicate transfer group',
      connectPostSale: undefined,
    });
    const event = makePaymentIntentEvent(
      'payment_intent.succeeded',
      {},
      { workspaceId: 'ws-1', orderId: 'order-1', type: 'sale' },
    );

    await expect(
      handlePaymentIntentEvent(asDeps(deps), event, undefined, 'stripe_ext_3'),
    ).rejects.toThrow('duplicate transfer group');
  });

  it('updates status to PROCESSING on payment_intent.processing', async () => {
    const deps = mockDeps();
    const event = makePaymentIntentEvent('payment_intent.processing', {}, { type: 'checkout' });

    await handlePaymentIntentEvent(asDeps(deps), event, { id: 'we_4' } as never, 'stripe_ext_4');

    expect(deps.prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: expect.objectContaining({ status: 'PROCESSING' }),
    });
  });

  it('updates status to CANCELED on payment_intent.canceled', async () => {
    const deps = mockDeps();
    const event = makePaymentIntentEvent(
      'payment_intent.canceled',
      { status: 'canceled' },
      { type: 'checkout' },
    );

    await handlePaymentIntentEvent(asDeps(deps), event, { id: 'we_5' } as never, 'stripe_ext_5');

    expect(deps.prisma.checkoutPayment.updateMany).toHaveBeenCalledWith({
      where: { externalId: 'pi_test_123' },
      data: expect.objectContaining({ status: 'CANCELED' }),
    });
  });

  it('throws when workspace does not exist', async () => {
    const deps = mockDeps();
    deps.prisma.workspace.findUnique.mockResolvedValueOnce(null);
    const event = makePaymentIntentEvent('payment_intent.succeeded');

    await expect(
      handlePaymentIntentEvent(asDeps(deps), event, undefined, 'stripe_ext_6'),
    ).rejects.toThrow('invalid_workspaceId');
  });

  it('does not call processSaleSucceeded when type is not sale', async () => {
    const deps = mockDeps();
    const event = makePaymentIntentEvent('payment_intent.succeeded', {}, { type: 'checkout' });

    await handlePaymentIntentEvent(asDeps(deps), event, { id: 'we_7' } as never, 'stripe_ext_7');

    expect(deps.stripeWebhookProcessor.processSaleSucceeded).not.toHaveBeenCalled();
  });
});

describe('handleCheckoutSessionCompleted', () => {
  it('processes a completed checkout session, updates payment, notifies contact, triggers autopilot', async () => {
    const deps = mockDeps();
    deps.prisma.contact.findFirst.mockResolvedValueOnce({
      id: 'contact_1',
      phone: '+5511999999999',
      workspaceId: 'ws-1',
    });
    const event = makeCheckoutSessionEvent();

    await handleCheckoutSessionCompleted(asDeps(deps), event, { id: 'we_cs_1' } as never);

    expect(deps.prisma.payment.updateMany).toHaveBeenCalled();
    expect(deps.prisma.kloelSale.updateMany).toHaveBeenCalled();
    // handleCheckoutSessionCompleted normalizes the phone (strips non-digits)
    // before dispatching the WhatsApp confirmation.
    expect(deps.whatsapp.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999',
      expect.stringContaining('Pagamento confirmado'),
    );
    expect(deps.autopilot.markConversion).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', reason: 'stripe_paid' }),
    );
    expect(deps.autopilot.triggerPostPurchaseFlow).toHaveBeenCalledWith(
      'ws-1',
      'contact_1',
      expect.objectContaining({ provider: 'stripe' }),
    );
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_cs_1');
  });

  it('throws when workspaceId is missing', async () => {
    const deps = mockDeps();
    const event = makeCheckoutSessionEvent({}, { workspaceId: undefined as unknown as string });

    await expect(handleCheckoutSessionCompleted(asDeps(deps), event, undefined)).rejects.toThrow(
      'missing_workspaceId',
    );
  });

  it('throws when workspace does not exist', async () => {
    const deps = mockDeps();
    deps.prisma.workspace.findUnique.mockResolvedValueOnce(null);
    const event = makeCheckoutSessionEvent();

    await expect(handleCheckoutSessionCompleted(asDeps(deps), event, undefined)).rejects.toThrow(
      'invalid_workspaceId',
    );
  });

  it('proceeds without contact when no phone/email matches and no phone in session', async () => {
    const deps = mockDeps();
    const event = makeCheckoutSessionEvent(
      {
        customer_details: { email: null, phone: null },
        customer_email: null,
        amount_total: 0,
        currency: null,
      },
      { workspaceId: 'ws-1' },
    );

    await handleCheckoutSessionCompleted(asDeps(deps), event, { id: 'we_cs_2' } as never);

    expect(deps.autopilot.markConversion).toHaveBeenCalled();
    expect(deps.whatsapp.sendMessage).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sem telefone'));
  });

  it('alerts and throws when financial update fails', async () => {
    const deps = mockDeps();
    deps.prisma.kloelSale.updateMany.mockRejectedValueOnce(new Error('sale update failed'));
    const event = makeCheckoutSessionEvent();

    await expect(
      handleCheckoutSessionCompleted(asDeps(deps), event, { id: 'we_cs_3' } as never),
    ).rejects.toThrow('financial_update_failed');

    expect(deps.financialAlert.webhookProcessingFailed).toHaveBeenCalled();
    expect(deps.webhooksService.markWebhookFailed).toHaveBeenCalledWith(
      'we_cs_3',
      'sale update failed',
    );
  });

  it('alerts and throws when post-purchase flow activation fails', async () => {
    const deps = mockDeps();
    deps.prisma.contact.findFirst.mockResolvedValueOnce({
      id: 'contact_1',
      phone: '+5511999999999',
      workspaceId: 'ws-1',
    });
    deps.autopilot.triggerPostPurchaseFlow.mockRejectedValueOnce(
      new Error('flow activation failed'),
    );
    const event = makeCheckoutSessionEvent();

    await expect(
      handleCheckoutSessionCompleted(asDeps(deps), event, { id: 'we_cs_4' } as never),
    ).rejects.toThrow('flow activation failed');

    expect(deps.financialAlert.webhookProcessingFailed).toHaveBeenCalled();
  });
});

describe('workspace isolation — handlers2', () => {
  it('handlePaymentIntentEvent for ws-A does not affect ws-B', async () => {
    const depsA = mockDeps();
    const depsB = mockDeps();
    const event = makePaymentIntentEvent('payment_intent.succeeded', {}, { type: 'checkout' });

    await handlePaymentIntentEvent(asDeps(depsA), event, { id: 'we_a' } as never, 'stripe_a');

    expect(depsB.prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
    expect(depsB.webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('handleCheckoutSessionCompleted for ws-A does not affect ws-B', async () => {
    const depsA = mockDeps();
    const depsB = mockDeps();
    const event = makeCheckoutSessionEvent();

    await handleCheckoutSessionCompleted(asDeps(depsA), event, { id: 'we_a' } as never);

    expect(depsB.prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
    expect(depsB.autopilot.markConversion).not.toHaveBeenCalled();
  });
});
