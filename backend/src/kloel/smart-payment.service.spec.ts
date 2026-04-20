import { ConfigService } from '@nestjs/config';

import { SmartPaymentService } from './smart-payment.service';

describe('SmartPaymentService — Stripe-only payment kernel', () => {
  let prisma: any;
  let paymentService: { createPayment: jest.Mock };
  let service: SmartPaymentService;

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

    service = new SmartPaymentService(
      prisma,
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
      paymentService as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
      { ensureTokenBudget: jest.fn(), trackAiUsage: jest.fn() } as any,
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
