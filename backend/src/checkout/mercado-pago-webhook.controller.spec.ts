import { ForbiddenException } from '@nestjs/common';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';

type PrismaMock = {
  checkoutPayment: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  checkoutOrder: {
    updateMany: jest.Mock;
  };
};

function buildController() {
  const prisma: PrismaMock = {
    checkoutPayment: {
      findFirst: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        order: { workspaceId: 'ws-1', status: 'PROCESSING' },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkoutOrder: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const webhooksService = {
    logWebhookEvent: jest.fn().mockResolvedValue({ id: 'wh_1' }),
    markWebhookProcessed: jest.fn().mockResolvedValue({ id: 'wh_1' }),
    markWebhookFailed: jest.fn().mockResolvedValue({ id: 'wh_1' }),
  };
  const mercadoPagoPixService = {
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    getPayment: jest.fn().mockResolvedValue({
      externalId: 'mp_123',
      status: 'approved',
      qrCode: '000201',
      qrCodeBase64: 'base64png==',
      copyPaste: '000201',
      expiresAt: '2026-05-06T22:59:59.000-03:00',
      metadata: {
        kloel_order_id: 'order-1',
        workspace_id: 'ws-1',
      },
      providerRaw: { id: 123, status: 'approved' },
    }),
  };

  const controller = new MercadoPagoWebhookController(
    prisma as never,
    webhooksService as never,
    mercadoPagoPixService as never,
  );

  return { controller, prisma, webhooksService, mercadoPagoPixService };
}

describe('MercadoPagoWebhookController', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('confirms approved Pix only after fetching provider payment status', async () => {
    const { controller, prisma, webhooksService, mercadoPagoPixService } = buildController();

    const result = await controller.handlePayment(
      { id: 'event-1', action: 'payment.updated', data: { id: 'mp_123' } },
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(mercadoPagoPixService.getPayment).toHaveBeenCalledWith('mp_123');
    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ externalId: 'mp_123' }, { orderId: 'order-1' }] },
        data: expect.objectContaining({
          status: 'APPROVED',
          externalId: 'mp_123',
          pixCopyPaste: '000201',
        }),
      }),
    );
    expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('wh_1');
    expect(result).toMatchObject({
      received: true,
      paymentId: 'mp_123',
      orderId: 'order-1',
      status: 'APPROVED',
    });
  });

  it('requires valid Mercado Pago signature when webhook secret is configured', async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = 'secret';
    const { controller, mercadoPagoPixService } = buildController();
    mercadoPagoPixService.verifyWebhookSignature.mockReturnValueOnce(false);

    await expect(
      controller.handlePayment(
        { id: 'event-1', action: 'payment.updated', data: { id: 'mp_123' } },
        'ts=1,v1=bad',
        'request-1',
        undefined,
        undefined,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not mark an order paid when checkout context is missing', async () => {
    const { controller, prisma, webhooksService, mercadoPagoPixService } = buildController();
    prisma.checkoutPayment.findFirst.mockResolvedValueOnce(null);
    mercadoPagoPixService.getPayment.mockResolvedValueOnce({
      externalId: 'mp_123',
      status: 'approved',
      qrCode: '000201',
      qrCodeBase64: 'base64png==',
      copyPaste: '000201',
      expiresAt: '2026-05-06T22:59:59.000-03:00',
      metadata: {},
      providerRaw: { id: 123, status: 'approved' },
    });

    const result = await controller.handlePayment(
      { id: 'event-1', action: 'payment.updated', data: { id: 'mp_123' } },
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
    expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
    expect(webhooksService.markWebhookFailed).toHaveBeenCalledWith(
      'wh_1',
      'missing_checkout_order_context',
    );
    expect(result).toEqual({
      received: true,
      ignored: true,
      reason: 'missing_checkout_order_context',
    });
  });

  it('skips provider lookup when webhook event is already processed', async () => {
    const { controller, prisma, webhooksService, mercadoPagoPixService } = buildController();
    webhooksService.logWebhookEvent.mockResolvedValueOnce({
      id: 'wh_1',
      status: 'processed',
    });

    const result = await controller.handlePayment(
      { id: 'event-1', action: 'payment.updated', data: { id: 'mp_123' } },
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(mercadoPagoPixService.getPayment).not.toHaveBeenCalled();
    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      received: true,
      skipped: true,
      reason: 'already_processed',
    });
  });

  it('skips payment mutation when the checkout order is already terminal', async () => {
    const { controller, prisma, webhooksService } = buildController();
    prisma.checkoutPayment.findFirst.mockResolvedValueOnce({
      orderId: 'order-1',
      order: { workspaceId: 'ws-1', status: 'PAID' },
    });

    const result = await controller.handlePayment(
      { id: 'event-1', action: 'payment.updated', data: { id: 'mp_123' } },
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('wh_1');
    expect(result).toEqual({
      received: true,
      skipped: true,
      reason: 'terminal_order_status',
      orderId: 'order-1',
      status: 'PAID',
    });
  });

  it('cancels checkout order when Mercado Pago returns rejected Pix status', async () => {
    const { controller, prisma, mercadoPagoPixService } = buildController();
    mercadoPagoPixService.getPayment.mockResolvedValueOnce({
      externalId: 'mp_123',
      status: 'rejected',
      qrCode: null,
      qrCodeBase64: null,
      copyPaste: null,
      expiresAt: null,
      metadata: {},
      providerRaw: { id: 123, status: 'rejected' },
    });

    await controller.handlePayment(
      { id: 'event-1', action: 'payment.updated', data: { id: 'mp_123' } },
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(prisma.checkoutPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED' }) }),
    );
    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', workspaceId: 'ws-1' },
        data: expect.objectContaining({
          status: 'CANCELED',
          canceledAt: expect.anything(),
        }),
      }),
    );
  });
});
