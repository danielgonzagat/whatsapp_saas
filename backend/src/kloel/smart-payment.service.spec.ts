import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

import { SmartPaymentService } from './smart-payment.service';

type SmartPaymentPrismaMock = {
  workspace: {
    findUnique: jest.Mock<
      Promise<{ name: string; providerSettings: Record<string, unknown> }>,
      [unknown]
    >;
  };
  contact: {
    findFirst: jest.Mock<Promise<{ id: string; name: string }>, [unknown]>;
  };
  kloelSale: {
    create: jest.Mock<Promise<unknown>, [unknown]>;
  };
};

type SmartPaymentGatewayResult = {
  id: string;
  invoiceUrl: string;
  pixQrCodeUrl: string;
  pixCopyPaste: string;
  paymentLink: string;
  status: string;
};

type SmartPaymentGatewayMock = {
  createPayment: jest.Mock<Promise<SmartPaymentGatewayResult>, [unknown]>;
};

type SmartPaymentPlanLimitsMock = {
  ensureTokenBudget: jest.Mock<void, [string]>;
  trackAiUsage: jest.Mock<Promise<void>, [string, number]>;
};

describe('SmartPaymentService — canonical Mercado Pago PIX kernel', () => {
  let prisma: SmartPaymentPrismaMock;
  let paymentService: SmartPaymentGatewayMock;
  let service: SmartPaymentService;
  let planLimits: SmartPaymentPlanLimitsMock;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Workspace Teste',
          providerSettings: {},
        }),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contact-1',
          name: 'Cliente Pix',
        }),
      },
      kloelSale: {
        create: jest.fn(),
      },
    };

    const createPayment = jest.fn<Promise<SmartPaymentGatewayResult>, [unknown]>();
    createPayment.mockResolvedValue({
      id: 'mp_pix_1',
      invoiceUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      pixQrCodeUrl: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      paymentLink: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      status: 'pending',
    });
    paymentService = { createPayment };
    planLimits = {
      ensureTokenBudget: jest.fn(),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    service = new SmartPaymentService(
      prisma as never as PrismaService,
      {
        get: jest.fn((key: string) => {
          if (key === 'OPENAI_API_KEY') {
            return undefined;
          }
          if (key === 'FRONTEND_URL') {
            return 'https://app.kloel.test';
          }
          return undefined;
        }),
      } as never as ConfigService,
      paymentService as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      planLimits as never,
    );
  });

  it('creates PIX payments through PaymentService and forwards Mercado Pago payer data', async () => {
    const result = await service.createSmartPayment({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      customerName: 'Cliente Pix',
      customerEmail: 'cliente@example.com',
      amount: 139.9,
      productName: 'Produto X',
    });

    expect(paymentService.createPayment).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      leadId: 'contact-1',
      customerName: 'Cliente Pix',
      customerPhone: '5511999999999',
      customerEmail: 'cliente@example.com',
      amount: 139.9,
      description: 'Produto X',
      idempotencyKey: 'smart-payment:ws-1:contact-1:139.9:Produto X',
    });

    expect(result).toMatchObject({
      paymentId: 'mp_pix_1',
      paymentUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
      pixQrCode: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      billingType: 'PIX',
    });
  });
});
