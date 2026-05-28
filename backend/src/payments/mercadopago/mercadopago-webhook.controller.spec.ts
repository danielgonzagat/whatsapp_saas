import { Test, type TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { MercadoPagoConfigService } from './mercadopago.config';
import { MercadoPagoPixChargeService } from './mercadopago-pix-charge.service';
import { MercadoPagoWebhookSignatureVerifier } from './mercadopago-webhook-signature.verifier';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';

type UpdateManyArg = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

type PrismaMock = {
  webhookEvent: {
    create: jest.Mock<Promise<Record<string, unknown>>, [Record<string, unknown>]>;
    update: jest.Mock<Promise<Record<string, unknown>>, [Record<string, unknown>]>;
  };
  payment: {
    findFirst: jest.Mock<Promise<{ workspaceId: string } | null>, [Record<string, unknown>]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [UpdateManyArg]>;
  };
  checkoutPayment: {
    findFirst: jest.Mock<
      Promise<{ orderId: string; order: { workspaceId: string; status: string } } | null>,
      [Record<string, unknown>]
    >;
    updateMany: jest.Mock<Promise<{ count: number }>, [UpdateManyArg]>;
  };
  checkoutOrder: {
    updateMany: jest.Mock<Promise<{ count: number }>, [UpdateManyArg]>;
  };
  kloelSale: {
    findFirst: jest.Mock<
      Promise<{ id: string; workspaceId: string; status: string } | null>,
      [Record<string, unknown>]
    >;
    updateMany: jest.Mock<Promise<{ count: number }>, [UpdateManyArg]>;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    webhookEvent: {
      create: jest
        .fn<Promise<Record<string, unknown>>, [Record<string, unknown>]>()
        .mockResolvedValue({ id: 'evt-1' }),
      update: jest
        .fn<Promise<Record<string, unknown>>, [Record<string, unknown>]>()
        .mockResolvedValue({ id: 'evt-1' }),
    },
    payment: {
      findFirst: jest
        .fn<Promise<{ workspaceId: string } | null>, [Record<string, unknown>]>()
        .mockResolvedValue(null),
      updateMany: jest
        .fn<Promise<{ count: number }>, [UpdateManyArg]>()
        .mockResolvedValue({ count: 1 }),
    },
    checkoutPayment: {
      findFirst: jest
        .fn<
          Promise<{ orderId: string; order: { workspaceId: string; status: string } } | null>,
          [Record<string, unknown>]
        >()
        .mockResolvedValue(null),
      updateMany: jest
        .fn<Promise<{ count: number }>, [UpdateManyArg]>()
        .mockResolvedValue({ count: 1 }),
    },
    checkoutOrder: {
      updateMany: jest
        .fn<Promise<{ count: number }>, [UpdateManyArg]>()
        .mockResolvedValue({ count: 1 }),
    },
    kloelSale: {
      findFirst: jest
        .fn<
          Promise<{ id: string; workspaceId: string; status: string } | null>,
          [Record<string, unknown>]
        >()
        .mockResolvedValue(null),
      updateMany: jest
        .fn<Promise<{ count: number }>, [UpdateManyArg]>()
        .mockResolvedValue({ count: 1 }),
    },
  };
}

describe('MercadoPagoWebhookController', () => {
  let controller: MercadoPagoWebhookController;
  let prisma: PrismaMock;
  let pixCharge: { getStatus: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    pixCharge = {
      getStatus: jest.fn().mockResolvedValue({
        status: 'approved',
        raw: { id: 'mp_pix_1', status: 'approved' },
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MercadoPagoWebhookController],
      providers: [
        { provide: MercadoPagoConfigService, useValue: { isAvailable: jest.fn(() => true) } },
        {
          provide: MercadoPagoWebhookSignatureVerifier,
          useValue: { verify: jest.fn(() => ({ ok: true })) },
        },
        { provide: MercadoPagoPixChargeService, useValue: pixCharge },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = moduleRef.get(MercadoPagoWebhookController);
  });

  it('updates checkout payment and marks checkout order paid when Mercado Pago approves a checkout PIX', async () => {
    prisma.payment.findFirst.mockResolvedValueOnce({ workspaceId: 'ws-1' });
    prisma.checkoutPayment.findFirst.mockResolvedValueOnce({
      orderId: 'order-1',
      order: { workspaceId: 'ws-1', status: 'PENDING' },
    });

    await controller.receive('ts=1,v1=ok', 'req-1', {
      type: 'payment',
      data: { id: 'mp_pix_1' },
    });

    const paymentUpdateArg = prisma.payment.updateMany.mock.calls[0]?.[0];
    expect(paymentUpdateArg?.where).toEqual({
      workspaceId: 'ws-1',
      externalId: 'mp_pix_1',
      provider: 'mercadopago',
    });
    expect(paymentUpdateArg?.data.status).toBe('APPROVED');

    const checkoutPaymentUpdateArg = prisma.checkoutPayment.updateMany.mock.calls[0]?.[0];
    expect(checkoutPaymentUpdateArg?.where).toEqual({
      externalId: 'mp_pix_1',
      orderId: 'order-1',
    });
    expect(checkoutPaymentUpdateArg?.data.status).toBe('APPROVED');
    expect(checkoutPaymentUpdateArg?.data.webhookData).toMatchObject({
      provider: 'mercadopago',
      eventType: 'payment',
      paymentStatus: 'approved',
      payment: { id: 'mp_pix_1', status: 'approved' },
    });

    const processingArg = prisma.checkoutOrder.updateMany.mock.calls[0]?.[0];
    expect(processingArg).toEqual({
      where: { id: 'order-1', workspaceId: 'ws-1' },
      data: { status: 'PROCESSING' },
    });

    const paidArg = prisma.checkoutOrder.updateMany.mock.calls[1]?.[0];
    expect(paidArg?.where).toEqual({ id: 'order-1', workspaceId: 'ws-1' });
    expect(paidArg?.data.status).toBe('PAID');
    expect(paidArg?.data.paidAt).toBeInstanceOf(Date);
  });

  it('updates only the checkout payment when the checkout order is already terminal', async () => {
    prisma.checkoutPayment.findFirst.mockResolvedValueOnce({
      orderId: 'order-paid',
      order: { workspaceId: 'ws-1', status: 'PAID' },
    });

    await controller.receive('ts=1,v1=ok', 'req-2', {
      action: 'payment.updated',
      data: { id: 'mp_pix_paid' },
    });

    const checkoutPaymentUpdateArg = prisma.checkoutPayment.updateMany.mock.calls[0]?.[0];
    expect(checkoutPaymentUpdateArg?.data.status).toBe('APPROVED');
    expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
  });

  it('marks chat-generated Kloel sales paid when Mercado Pago approves by payment id', async () => {
    prisma.kloelSale.findFirst.mockResolvedValueOnce({
      id: 'sale-boleto-1',
      workspaceId: 'ws-1',
      status: 'pending',
    });
    pixCharge.getStatus.mockResolvedValueOnce({
      status: 'approved',
      raw: { id: 'mp_boleto_1', status: 'approved' },
    });

    await controller.receive('ts=1,v1=ok', 'req-4', {
      action: 'payment.updated',
      data: { id: 'mp_boleto_1' },
    });

    const saleLookupArg = prisma.kloelSale.findFirst.mock.calls[0]?.[0];
    expect(saleLookupArg?.where).toEqual({
      OR: [
        { externalPaymentId: 'mp_boleto_1' },
        { metadata: { path: ['mercadoPagoPaymentId'], equals: 'mp_boleto_1' } },
      ],
    });

    const saleUpdateArg = prisma.kloelSale.updateMany.mock.calls[0]?.[0];
    expect(saleUpdateArg?.where).toEqual({ id: 'sale-boleto-1', workspaceId: 'ws-1' });
    expect(saleUpdateArg?.data.status).toBe('paid');
    expect(saleUpdateArg?.data.paidAt).toBeInstanceOf(Date);
  });

  it('short-circuits duplicate webhook events before fetching provider status', async () => {
    const duplicateError = Object.assign(new Error('duplicate'), { code: 'P2002' });
    prisma.webhookEvent.create.mockRejectedValueOnce(duplicateError);

    const result = await controller.receive('ts=1,v1=ok', 'req-3', {
      type: 'payment',
      data: { id: 'mp_pix_1' },
    });

    expect(result).toEqual({ received: true, duplicate: true });
    expect(pixCharge.getStatus).not.toHaveBeenCalled();
    expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
  });
});
