import { Test, type TestingModule } from '@nestjs/testing';

import { AuditService } from '../audit/audit.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { PrismaService } from '../prisma/prisma.service';

import { PaymentService } from './payment.service';

type KloelSaleRecord = Record<string, unknown>;

type KloelSaleMock = {
  create: jest.Mock<Promise<KloelSaleRecord | undefined>, [unknown]>;
  findFirst: jest.Mock<Promise<KloelSaleRecord | null>, [unknown]>;
  findMany: jest.Mock<Promise<unknown[]>, [unknown?]>;
  updateMany: jest.Mock<Promise<unknown>, [unknown]>;
};

type PaymentPrismaTransaction = {
  kloelSale: KloelSaleMock;
};

type PaymentPrismaMock = {
  workspace: {
    findUnique: jest.Mock<Promise<{ id: string; name: string }>, [unknown]>;
  };
  memberArea: {
    findMany: jest.Mock<Promise<Array<{ slug: string }>>, [unknown]>;
  };
  kloelSale: KloelSaleMock;
  $transaction: jest.Mock<Promise<unknown>, [(tx: PaymentPrismaTransaction) => Promise<unknown>]>;
};

describe('PaymentService — Mercado Pago Pix', () => {
  let service: PaymentService;
  let prisma: PaymentPrismaMock;
  let mercadoPagoPix: { create: jest.Mock };
  let fraudEngine: { evaluate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn<Promise<{ id: string; name: string }>, [unknown]>().mockResolvedValue({
          id: 'ws-1',
          name: 'Workspace Teste',
        }),
      },
      memberArea: {
        findMany: jest.fn<Promise<{ slug: string }[]>, [unknown]>().mockResolvedValue([]),
      },
      kloelSale: {
        create: jest.fn<Promise<KloelSaleRecord | undefined>, [unknown]>(),
        findFirst: jest.fn<Promise<KloelSaleRecord | null>, [unknown]>(),
        findMany: jest.fn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([]),
        updateMany: jest.fn<Promise<unknown>, [unknown]>(),
      },
      $transaction: jest.fn(async (cb: (tx: PaymentPrismaTransaction) => Promise<unknown>) =>
        cb({
          kloelSale: {
            findFirst: prisma.kloelSale.findFirst,
            create: prisma.kloelSale.create,
            findMany: prisma.kloelSale.findMany,
            updateMany: prisma.kloelSale.updateMany,
          },
        }),
      ),
    };

    mercadoPagoPix = {
      create: jest.fn(),
    };

    fraudEngine = {
      evaluate: jest.fn().mockResolvedValue({
        action: 'allow',
        score: 0,
        reasons: [],
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: MercadoPagoPixChargeService, useValue: mercadoPagoPix },
        { provide: AuditService, useValue: { logWithTx: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: FinancialAlertService,
          useValue: { paymentFailed: jest.fn() },
        },
        { provide: FraudEngine, useValue: fraudEngine },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  });

  it('creates a Mercado Pago Pix charge and persists QR metadata on KloelSale', async () => {
    mercadoPagoPix.create.mockResolvedValue({
      externalId: 'mp_pix_1',
      status: 'pending',
      qrCode: '000201pixcopy',
      qrCodeBase64: 'qr-base64',
      ticketUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      expiresAt: new Date('2026-04-17T10:30:00.000Z'),
      raw: { id: 'mp_pix_1' },
    });

    prisma.kloelSale.create.mockResolvedValue({
      id: 'sale-1',
      externalPaymentId: 'mp_pix_1',
    });

    const result = await service.createPayment({
      workspaceId: 'ws-1',
      leadId: 'lead-1',
      customerName: 'Cliente Pix',
      customerPhone: '5511999999999',
      customerEmail: 'cliente@example.com',
      amount: 139.9,
      description: 'Pagamento Kloel',
    });

    expect(mercadoPagoPix.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 13_990n,
        payerEmail: 'cliente@example.com',
        payerName: 'Cliente Pix',
        description: 'Pagamento Kloel',
        externalReference: expect.stringContaining('kloel-payment:'),
        idempotencyKey: expect.stringContaining('kloel-payment:'),
        notificationUrl: expect.stringContaining('/webhooks/mercadopago'),
      }),
    );

    expect(prisma.kloelSale.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        status: 'pending',
        amount: 139.9,
        paymentMethod: 'PIX',
        paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
        externalPaymentId: 'mp_pix_1',
        workspaceId: 'ws-1',
        metadata: expect.objectContaining({
          gateway: 'mercadopago',
          pixQrCodeUrl: 'data:image/png;base64,qr-base64',
          pixCopyPaste: '000201pixcopy',
          pixHostedInstructionsUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
        }),
      }),
    });

    expect(result).toMatchObject({
      id: 'mp_pix_1',
      invoiceUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      pixQrCodeUrl: 'data:image/png;base64,qr-base64',
      pixCopyPaste: '000201pixcopy',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      status: 'pending',
    });
  });

  it('requires payer email before creating a Mercado Pago Pix charge', async () => {
    await expect(
      service.createPayment({
        workspaceId: 'ws-1',
        leadId: 'lead-1',
        customerName: 'Cliente Pix',
        customerPhone: '5511999999999',
        amount: 139.9,
        description: 'Pagamento Kloel',
      }),
    ).rejects.toThrow(/e-mail do comprador/i);

    expect(mercadoPagoPix.create).not.toHaveBeenCalled();
  });

  it('blocks the payment before hitting Mercado Pago when antifraud returns block', async () => {
    fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'block',
      score: 1,
      reasons: [{ signal: 'blacklist', detail: 'email' }],
    });

    await expect(
      service.createPayment({
        workspaceId: 'ws-1',
        leadId: 'lead-1',
        customerName: 'Cliente Pix',
        customerPhone: '5511999999999',
        customerEmail: 'blocked@example.com',
        amount: 139.9,
        description: 'Pagamento Kloel',
      }),
    ).rejects.toThrow(/antifraude/i);

    expect(mercadoPagoPix.create).not.toHaveBeenCalled();
  });

  it('routes PIX payments to manual review when antifraud returns require_3ds', async () => {
    fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'require_3ds',
      score: 0.35,
      reasons: [{ signal: 'high_amount', detail: 'large pix payment' }],
    });

    await expect(
      service.createPayment({
        workspaceId: 'ws-1',
        leadId: 'lead-1',
        customerName: 'Cliente Pix',
        customerPhone: '5511999999999',
        customerEmail: 'review@example.com',
        amount: 139.9,
        description: 'Pagamento Kloel',
      }),
    ).rejects.toThrow(/revisão manual/i);

    expect(mercadoPagoPix.create).not.toHaveBeenCalled();
  });

  it('does not persist a duplicate sale row when Mercado Pago replays the same idempotent Pix charge', async () => {
    mercadoPagoPix.create.mockResolvedValue({
      externalId: 'mp_pix_existing',
      status: 'pending',
      qrCode: '000201pixcopy',
      qrCodeBase64: 'qr-base64',
      ticketUrl: 'https://www.mercadopago.com.br/payments/mp_pix_existing/ticket',
      expiresAt: new Date('2026-04-17T10:30:00.000Z'),
      raw: { id: 'mp_pix_existing' },
    });

    prisma.kloelSale.findFirst.mockResolvedValue({
      id: 'sale-existing',
    });

    await service.createPayment({
      workspaceId: 'ws-1',
      leadId: 'lead-1',
      customerName: 'Cliente Pix',
      customerPhone: '5511999999999',
      customerEmail: 'cliente@example.com',
      amount: 139.9,
      description: 'Pagamento Kloel',
      idempotencyKey: 'kloel-payment:test-key',
    });

    expect(prisma.kloelSale.create).not.toHaveBeenCalled();
  });

  it('returns persisted Pix details from sale metadata on the public payload', async () => {
    prisma.kloelSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      externalPaymentId: 'mp_pix_1',
      amount: 139.9,
      productName: 'Produto X',
      status: 'pending',
      paymentMethod: 'PIX',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      createdAt: new Date('2026-04-17T10:00:00.000Z'),
      paidAt: null,
      metadata: {
        companyName: 'Workspace Teste',
        pixQrCodeUrl: 'data:image/png;base64,qr',
        pixCopyPaste: '000201pixcopy',
        pixHostedInstructionsUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      },
    });
    prisma.memberArea.findMany.mockResolvedValue([{ slug: 'curso-digital' }]);

    const result = await service.getPublicPayment('mp_pix_1');

    expect(result).toMatchObject({
      id: 'mp_pix_1',
      amount: 139.9,
      productName: 'Produto X',
      companyName: 'Workspace Teste',
      pixQrCodeUrl: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      memberAreaUrl: '/area/curso-digital',
    });
  });
});
