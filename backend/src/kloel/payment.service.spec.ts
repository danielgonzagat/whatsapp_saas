import { Test, type TestingModule } from '@nestjs/testing';

import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { FinancialAlertService } from '../common/financial-alert.service';
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
  kloelSale: KloelSaleMock;
  $transaction: jest.Mock<Promise<unknown>, [(tx: PaymentPrismaTransaction) => Promise<unknown>]>;
};

describe('PaymentService — Stripe-only Pix', () => {
  let service: PaymentService;
  let prisma: PaymentPrismaMock;
  let stripeService: { stripe: { paymentIntents: { create: jest.Mock } } };

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws-1',
          name: 'Workspace Teste',
        }),
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

    stripeService = {
      stripe: {
        paymentIntents: {
          create: jest.fn(),
        },
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripeService },
        { provide: AuditService, useValue: { logWithTx: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: FinancialAlertService,
          useValue: { paymentFailed: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  });

  it('creates a Stripe Pix PaymentIntent and persists QR metadata on KloelSale', async () => {
    stripeService.stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_pix_1',
      status: 'requires_action',
      client_secret: 'pi_pix_1_secret',
      next_action: {
        type: 'pix_display_qr_code',
        pix_display_qr_code: {
          data: '000201pixcopy',
          image_url_png: 'data:image/png;base64,qr',
          hosted_instructions_url: 'https://pay.stripe.com/pix/pi_pix_1',
        },
      },
    });

    prisma.kloelSale.create.mockResolvedValue({
      id: 'sale-1',
      externalPaymentId: 'pi_pix_1',
    });

    const result = await service.createPayment({
      workspaceId: 'ws-1',
      leadId: 'lead-1',
      customerName: 'Cliente Pix',
      customerPhone: '5511999999999',
      amount: 139.9,
      description: 'Pagamento Kloel',
    });

    expect(stripeService.stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 13_990,
        currency: 'brl',
        confirm: true,
        payment_method_types: ['pix'],
        metadata: expect.objectContaining({
          type: 'kloel_payment',
          workspaceId: 'ws-1',
          leadId: 'lead-1',
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining('kloel-payment:'),
      }),
    );

    expect(prisma.kloelSale.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        status: 'pending',
        amount: 139.9,
        paymentMethod: 'PIX',
        paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
        externalPaymentId: 'pi_pix_1',
        workspaceId: 'ws-1',
        metadata: expect.objectContaining({
          pixQrCodeUrl: 'data:image/png;base64,qr',
          pixCopyPaste: '000201pixcopy',
          pixHostedInstructionsUrl: 'https://pay.stripe.com/pix/pi_pix_1',
        }),
      }),
    });

    expect(result).toMatchObject({
      id: 'pi_pix_1',
      invoiceUrl: 'https://pay.stripe.com/pix/pi_pix_1',
      pixQrCodeUrl: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
      status: 'requires_action',
    });
  });

  it('does not persist a duplicate sale row when Stripe replays the same idempotent PaymentIntent', async () => {
    stripeService.stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_pix_existing',
      status: 'requires_action',
      next_action: {
        type: 'pix_display_qr_code',
        pix_display_qr_code: {
          data: '000201pixcopy',
          image_url_png: 'data:image/png;base64,qr',
          hosted_instructions_url: 'https://pay.stripe.com/pix/pi_pix_existing',
        },
      },
    });

    prisma.kloelSale.findFirst.mockResolvedValue({
      id: 'sale-existing',
    });

    await service.createPayment({
      workspaceId: 'ws-1',
      leadId: 'lead-1',
      customerName: 'Cliente Pix',
      customerPhone: '5511999999999',
      amount: 139.9,
      description: 'Pagamento Kloel',
      idempotencyKey: 'kloel-payment:test-key',
    });

    expect(prisma.kloelSale.create).not.toHaveBeenCalled();
  });

  it('returns persisted Pix details from sale metadata on the public payload', async () => {
    prisma.kloelSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      externalPaymentId: 'pi_pix_1',
      amount: 139.9,
      productName: 'Produto X',
      status: 'pending',
      paymentMethod: 'PIX',
      paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
      createdAt: new Date('2026-04-17T10:00:00.000Z'),
      paidAt: null,
      metadata: {
        companyName: 'Workspace Teste',
        pixQrCodeUrl: 'data:image/png;base64,qr',
        pixCopyPaste: '000201pixcopy',
        pixHostedInstructionsUrl: 'https://pay.stripe.com/pix/pi_pix_1',
      },
    });

    const result = await service.getPublicPayment('pi_pix_1');

    expect(result).toMatchObject({
      id: 'pi_pix_1',
      amount: 139.9,
      productName: 'Produto X',
      companyName: 'Workspace Teste',
      pixQrCodeUrl: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
    });
  });
});
