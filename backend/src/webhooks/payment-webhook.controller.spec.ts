import { PaymentWebhookController } from './payment-webhook.controller';

describe('PaymentWebhookController.handleStripe — checkout payment intents', () => {
  function buildController() {
    const autopilot = {
      markConversion: jest.fn().mockResolvedValue(undefined),
      triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
    };
    const whatsapp = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      },
      checkoutPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      checkoutOrder: {
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
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
    };
    const webhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_1' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    };

    const controller = new PaymentWebhookController(
      autopilot as never,
      whatsapp as never,
      prisma as never,
      redis as never,
      webhooksService as never,
    );

    return { controller, prisma, redis, webhooksService, autopilot, whatsapp };
  }

  it('marks checkout payment/order as paid when payment_intent.succeeded arrives for a Kloel order', async () => {
    const { controller, prisma, webhooksService } = buildController();

    const result = await controller.handleStripe(
      {
        body: {
          id: 'evt_pi_succeeded',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
              status: 'succeeded',
              metadata: {
                workspace_id: 'ws-1',
                kloel_order_id: 'order-1',
              },
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_pi_succeeded',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            status: 'succeeded',
            metadata: {
              workspace_id: 'ws-1',
              kloel_order_id: 'order-1',
            },
          },
        },
      } as never,
    );

    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'pi_test_123' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', workspaceId: 'ws-1' },
        data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }),
      }),
    );
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
    expect(result).toEqual({ received: true });
  });

  it('marks the checkout payment as declined when payment_intent.payment_failed arrives', async () => {
    const { controller, prisma } = buildController();

    await controller.handleStripe(
      {
        body: {
          id: 'evt_pi_failed',
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: 'pi_test_456',
              status: 'requires_payment_method',
              metadata: {
                workspace_id: 'ws-1',
                kloel_order_id: 'order-2',
              },
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_pi_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_456',
            status: 'requires_payment_method',
            metadata: {
              workspace_id: 'ws-1',
              kloel_order_id: 'order-2',
            },
          },
        },
      } as never,
    );

    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 'pi_test_456' },
        data: expect.objectContaining({ status: 'DECLINED' }),
      }),
    );
    expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
  });

  it('marks generic KloelSale records as paid when a Stripe payment intent succeeds outside checkout orders', async () => {
    const { controller, prisma } = buildController();

    await controller.handleStripe(
      {
        body: {
          id: 'evt_pi_generic_paid',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_generic_123',
              status: 'succeeded',
              metadata: {
                workspaceId: 'ws-1',
                type: 'kloel_payment',
              },
            },
          },
        } as never,
        rawBody: '',
        url: '/webhook/payment/stripe',
      },
      undefined,
      undefined,
      {
        id: 'evt_pi_generic_paid',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_generic_123',
            status: 'succeeded',
            metadata: {
              workspaceId: 'ws-1',
              type: 'kloel_payment',
            },
          },
        },
      } as never,
    );

    expect(prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalPaymentId: 'pi_generic_123' },
      data: { status: 'paid', paidAt: expect.any(Date) },
    });
  });
});
