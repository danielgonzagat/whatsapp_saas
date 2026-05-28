import { Test, type TestingModule } from '@nestjs/testing';

import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import {
  MercadoPagoBoletoOrderService,
  MercadoPagoPixChargeService,
} from '../payments/mercadopago/mercadopago-pix-charge.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { PrismaService } from '../prisma/prisma.service';

import { PaymentService } from './payment.service';
import {
  type BoletoOrderResult,
  type CreateBoletoOrderInput,
  type CreatePixChargeInput,
  type PixChargeResult,
} from '../payments/mercadopago/mercadopago.types';

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

type MercadoPagoPixMock = {
  create: jest.Mock<Promise<PixChargeResult>, [CreatePixChargeInput]>;
};

type MercadoPagoBoletoMock = {
  create: jest.Mock<Promise<BoletoOrderResult>, [CreateBoletoOrderInput]>;
};

type SaleCreateCall = {
  data: {
    leadId: string;
    status: string;
    amount: number;
    paymentMethod: string;
    paymentLink: string;
    externalPaymentId: string;
    workspaceId: string;
    metadata: Record<string, unknown>;
  };
};

describe('PaymentService — Mercado Pago Pix', () => {
  let service: PaymentService;
  let prisma: PaymentPrismaMock;
  let mercadoPagoPix: MercadoPagoPixMock;
  let mercadoPagoBoleto: MercadoPagoBoletoMock;
  let fraudEngine: { evaluate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws-1',
          name: 'Workspace Teste',
        }),
      },
      memberArea: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      kloelSale: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
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
      create: jest.fn<Promise<PixChargeResult>, [CreatePixChargeInput]>(),
    };

    mercadoPagoBoleto = {
      create: jest.fn<Promise<BoletoOrderResult>, [CreateBoletoOrderInput]>(),
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
        { provide: MercadoPagoBoletoOrderService, useValue: mercadoPagoBoleto },
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
      qrCodeBase64: 'data:image/png;base64,qr',
      ticketUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      expiresAt: new Date('2026-05-28T12:30:00.000Z'),
      raw: {},
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
      idempotencyKey: 'kloel-payment:test-key',
    });

    const pixInput = mercadoPagoPix.create.mock.calls[0]?.[0];
    expect(pixInput).toBeDefined();
    if (!pixInput) {
      throw new Error('pix_input_missing');
    }
    expect(pixInput.idempotencyKey).toBe('kloel-payment:test-key');
    expect(pixInput.amountCents).toBe(13_990n);
    expect(pixInput.payerEmail).toBe('cliente@example.com');
    expect(pixInput.payerName).toBe('Cliente Pix');
    expect(pixInput.description).toBe('Pagamento Kloel');
    expect(pixInput.externalReference).toContain('kloel-payment:');
    expect(pixInput.notificationUrl).toContain('/webhooks/mercadopago');

    const saleCreateCall = prisma.kloelSale.create.mock.calls[0]?.[0] as SaleCreateCall | undefined;
    expect(saleCreateCall?.data).toMatchObject({
      leadId: 'lead-1',
      status: 'pending',
      amount: 139.9,
      paymentMethod: 'PIX',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      externalPaymentId: 'mp_pix_1',
      workspaceId: 'ws-1',
    });
    expect(saleCreateCall?.data.metadata).toMatchObject({
      pixQrCodeUrl: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      pixHostedInstructionsUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
    });

    expect(result).toMatchObject({
      id: 'mp_pix_1',
      invoiceUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      pixQrCodeUrl: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      status: 'pending',
    });
  });

  it('creates a Mercado Pago boleto order and persists boleto metadata on KloelSale', async () => {
    mercadoPagoBoleto.create.mockResolvedValue({
      externalId: 'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',
      paymentId: 'PAY01J6TC8BYRR0T4ZKY0QRTZ0E24',
      status: 'pending',
      ticketUrl: 'https://www.mercadopago.com.br/payments/boleto/ticket',
      barcodeContent: '3335008800000000006004835002100020000242462010',
      digitableLine: '23793380296060054351030006333303799140000020000',
      raw: {},
    });

    prisma.kloelSale.create.mockResolvedValue({
      id: 'sale-boleto-1',
      externalPaymentId: 'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',
    });

    const result = await service.createBoletoPayment({
      workspaceId: 'ws-1',
      leadId: 'lead-1',
      customerName: 'Cliente Boleto',
      customerPhone: '5511999999999',
      customerEmail: 'boleto@example.com',
      customerCpf: '123.456.789-09',
      amount: 200,
      description: 'Produto Boleto',
      idempotencyKey: 'kloel-boleto:test-key',
      boletoAddress: {
        zipCode: '06233-903',
        streetName: 'Av. das Nações Unidas',
        streetNumber: '3003',
        neighborhood: 'Bonfim',
        city: 'Osasco',
        state: 'sp',
      },
    });

    const boletoInput = mercadoPagoBoleto.create.mock.calls[0]?.[0];
    expect(boletoInput).toBeDefined();
    if (!boletoInput) {
      throw new Error('boleto_input_missing');
    }
    expect(boletoInput.idempotencyKey).toBe('kloel-boleto:test-key');
    expect(boletoInput.amountCents).toBe(20_000n);
    expect(boletoInput.payerEmail).toBe('boleto@example.com');
    expect(boletoInput.payerName).toBe('Cliente Boleto');
    expect(boletoInput.payerDocument).toBe('12345678909');
    expect(boletoInput.payerAddress).toMatchObject({
      zipCode: '06233903',
      streetName: 'Av. das Nações Unidas',
      streetNumber: '3003',
      neighborhood: 'Bonfim',
      city: 'Osasco',
      state: 'SP',
    });
    expect(boletoInput.description).toBe('Produto Boleto');
    expect(boletoInput.externalReference).toContain('kloel-boleto:');
    expect(boletoInput.expirationTime).toBe('P3D');

    const saleCreateCall = prisma.kloelSale.create.mock.calls[0]?.[0] as SaleCreateCall | undefined;
    expect(saleCreateCall?.data).toMatchObject({
      leadId: 'lead-1',
      status: 'pending',
      amount: 200,
      paymentMethod: 'BOLETO',
      paymentLink: 'https://www.mercadopago.com.br/payments/boleto/ticket',
      externalPaymentId: 'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',
      workspaceId: 'ws-1',
    });
    expect(saleCreateCall?.data.metadata).toMatchObject({
      boletoTicketUrl: 'https://www.mercadopago.com.br/payments/boleto/ticket',
      boletoBarcodeContent: '3335008800000000006004835002100020000242462010',
      boletoDigitableLine: '23793380296060054351030006333303799140000020000',
      mercadoPagoOrderId: 'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',
      mercadoPagoPaymentId: 'PAY01J6TC8BYRR0T4ZKY0QRTZ0E24',
    });

    expect(result).toMatchObject({
      id: 'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',
      providerPaymentId: 'PAY01J6TC8BYRR0T4ZKY0QRTZ0E24',
      invoiceUrl: 'https://www.mercadopago.com.br/payments/boleto/ticket',
      boletoPdfUrl: 'https://www.mercadopago.com.br/payments/boleto/ticket',
      boletoCode: '23793380296060054351030006333303799140000020000',
      barcodeContent: '3335008800000000006004835002100020000242462010',
      paymentLink: 'https://www.mercadopago.com.br/payments/boleto/ticket',
      status: 'pending',
    });
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

  it('does not persist a duplicate sale row when Mercado Pago replays the same idempotent charge', async () => {
    mercadoPagoPix.create.mockResolvedValue({
      externalId: 'mp_pix_existing',
      status: 'pending',
      qrCode: '000201pixcopy',
      qrCodeBase64: 'data:image/png;base64,qr',
      ticketUrl: 'https://www.mercadopago.com.br/payments/mp_pix_existing/ticket',
      expiresAt: new Date('2026-05-28T12:30:00.000Z'),
      raw: {},
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
