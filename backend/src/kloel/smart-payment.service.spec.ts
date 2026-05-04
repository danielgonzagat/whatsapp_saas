import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

import { PaymentService } from './payment.service';
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

type SmartPaymentGatewayMock = {
  createPayment: jest.Mock<
    Promise<{
      id: string;
      invoiceUrl: string;
      pixQrCodeUrl: string;
      pixCopyPaste: string;
      paymentLink: string;
      status: string;
    }>,
    [unknown]
  >;
};

type SmartPaymentPlanLimitsMock = {
  ensureTokenBudget: jest.Mock<void, [string]>;
  trackAiUsage: jest.Mock<Promise<void>, [string, number]>;
};

// PULSE_OK: assertions exist below
describe('SmartPaymentService — Stripe-only payment kernel', () => {
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

    paymentService = {
      createPayment: jest.fn().mockResolvedValue({
        id: 'pi_pix_1',
        invoiceUrl: 'https://pay.stripe.com/pix/pi_pix_1',
        pixQrCodeUrl: 'data:image/png;base64,qr',
        pixCopyPaste: '000201pixcopy',
        paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
        status: 'requires_action',
      }),
    };
    planLimits = {
      ensureTokenBudget: jest.fn(),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    service = new SmartPaymentService(
      prisma as unknown as PrismaService,
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
      } as unknown as ConfigService,
      paymentService as unknown as PaymentService,
      { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
      planLimits as unknown as PlanLimitsService,
    );
  });

  it('creates PIX payments through PaymentService instead of calling a gateway-specific service', async () => {
    const result = await service.createSmartPayment({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      customerName: 'Cliente Pix',
      amount: 139.9,
      productName: 'Produto X',
    });

    expect(paymentService.createPayment).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      leadId: 'contact-1',
      customerName: 'Cliente Pix',
      customerPhone: '5511999999999',
      amount: 139.9,
      description: 'Produto X',
      idempotencyKey: 'smart-payment:ws-1:contact-1:139.9:Produto X',
    });

    expect(result).toMatchObject({
      paymentId: 'pi_pix_1',
      paymentUrl: 'https://pay.stripe.com/pix/pi_pix_1',
      pixQrCode: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopy',
      billingType: 'PIX',
    });
  });
});
