import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { ConnectService } from '../payments/connect/connect.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPaymentService } from './checkout-payment.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';

type CheckoutPaymentCreateArgs = {
  data: Record<string, unknown>;
};

type CheckoutPaymentTxClient = {
  checkoutPayment: {
    create: jest.Mock<Promise<Record<string, unknown>>, [CheckoutPaymentCreateArgs]>;
  };
  checkoutOrder: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

type CheckoutPaymentTxCallback = (tx: CheckoutPaymentTxClient) => Promise<unknown>;

type CheckoutPaymentPrismaMock = {
  checkoutOrder: {
    findFirst: jest.Mock;
  };
  checkoutPayment: {
    create: jest.Mock;
  };
  connectAccountBalance: {
    findFirst: jest.Mock;
  };
  workspace: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'KLOEL-001',
    workspaceId: 'ws-1',
    status: 'PENDING',
    totalInCents: 10_000,
    metadata: {
      baseTotalInCents: 10_000,
      chargedTotalInCents: 13_990,
      marketplaceFeeInCents: 4_980,
      platformFeeInCents: 990,
      installmentInterestInCents: 3_990,
    },
    shippingAddress: {
      cep: '01310-100',
      street: 'Av Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    shippingPrice: 0,
    ipAddress: '127.0.0.1',
    plan: {
      id: 'plan-1',
      name: 'Plano Principal',
      product: {
        id: 'prod-1',
        name: 'Produto X',
        description: 'Descrição X',
        imageUrl: null,
        images: [],
      },
    },
    ...overrides,
  };
}

function makeChargeResult(overrides: Record<string, unknown> = {}) {
  return {
    paymentIntentId: 'pi_test_123',
    clientSecret: 'pi_test_123_secret',
    stripePaymentIntent: {
      id: 'pi_test_123',
      status: 'requires_payment_method',
      next_action: null,
    },
    amountCents: 13_990n,
    applicationFeeCents: 4_980n,
    transferGroup: 'sale:order-1',
    split: {
      kloelTotalCents: 4_980n,
      residueCents: 9_010n,
      splits: [{ role: 'seller', accountId: 'acct_seller_1', amountCents: 9_010n }],
    },
    splitInput: {
      buyerPaidCents: 13_990n,
      saleValueCents: 10_000n,
      interestCents: 3_990n,
      platformFeeCents: 990n,
      seller: { accountId: 'acct_seller_1' },
    },
    ...overrides,
  };
}

describe('CheckoutPaymentService.processPayment — Stripe-only', () => {
  let service: CheckoutPaymentService;
  let prisma: CheckoutPaymentPrismaMock;
  let stripeCharge: { createSaleCharge: jest.Mock };
  let connectService: { createCustomAccount: jest.Mock };
  let fraudEngine: { evaluate: jest.Mock };
  let financialAlert: { paymentFailed: jest.Mock };
  let auditService: { log: jest.Mock; logWithTx: jest.Mock };
  let socialLeadService: { markConvertedFromOrder: jest.Mock };

  beforeEach(async () => {
    prisma = {
      checkoutOrder: {
        findFirst: jest.fn().mockResolvedValue(makeOrder()),
      },
      checkoutPayment: {
        create: jest.fn(),
      },
      connectAccountBalance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cab_seller_1',
          stripeAccountId: 'acct_seller_1',
          accountType: 'SELLER',
          workspaceId: 'ws-1',
        }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws-1',
          name: 'Workspace Teste',
          agents: [{ email: 'owner@example.com' }],
        }),
      },
      $transaction: jest.fn(),
    };

    stripeCharge = {
      createSaleCharge: jest.fn().mockResolvedValue(makeChargeResult()),
    };
    connectService = {
      createCustomAccount: jest.fn().mockResolvedValue({
        accountBalanceId: 'cab_seller_created',
        stripeAccountId: 'acct_seller_created',
        requestedCapabilities: ['card_payments', 'transfers'],
      }),
    };
    fraudEngine = {
      evaluate: jest.fn().mockResolvedValue({
        action: 'allow',
        score: 0,
        reasons: [],
      }),
    };
    financialAlert = { paymentFailed: jest.fn() };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
      logWithTx: jest.fn().mockResolvedValue(undefined),
    };
    socialLeadService = { markConvertedFromOrder: jest.fn().mockResolvedValue(null) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeChargeService, useValue: stripeCharge },
        { provide: ConnectService, useValue: connectService },
        { provide: FraudEngine, useValue: fraudEngine },
        { provide: FinancialAlertService, useValue: financialAlert },
        { provide: AuditService, useValue: auditService },
        { provide: CheckoutSocialLeadService, useValue: socialLeadService },
      ],
    }).compile();

    service = moduleRef.get(CheckoutPaymentService);
  });

  it('throws NotFoundException when the order does not exist', async () => {
    prisma.checkoutOrder.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.processPayment({
        orderId: 'missing',
        workspaceId: 'ws-1',
        customerName: 'Teste',
        customerEmail: 'test@example.com',
        paymentMethod: 'PIX',
        totalInCents: 10_000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects boleto because Stripe-only checkout does not support boleto in the active flow', async () => {
    await expect(
      service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Teste',
        customerEmail: 'test@example.com',
        paymentMethod: 'BOLETO',
        totalInCents: 10_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a card PaymentIntent, records a stripe payment row, and returns clientSecret for the checkout UI', async () => {
    const txCalls: string[] = [];
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => {
          txCalls.push('payment.create');
          return { id: 'pay_card_1', ...args.data };
        }),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => {
          txCalls.push('order.updateMany');
          return { count: 1 };
        }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (cb: CheckoutPaymentTxCallback, opts: { isolationLevel: string }) => {
        expect(opts).toMatchObject({ isolationLevel: 'ReadCommitted' });
        return cb(tx);
      },
    );

    const result = await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Teste',
      customerEmail: 'cliente@example.com',
      customerCPF: '123.456.789-09',
      customerPhone: '11999999999',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
      installments: 3,
    });

    expect(stripeCharge.createSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        sellerStripeAccountId: 'acct_seller_1',
        buyerPaidCents: 13_990n,
        saleValueCents: 10_000n,
        platformFeeCents: 990n,
        interestCents: 3_990n,
        paymentMethodTypes: ['card'],
      }),
    );
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'stripe',
          externalId: 'pi_test_123',
          status: 'PENDING',
          cardLast4: null,
        }),
      }),
    );
    expect(txCalls).toEqual(['payment.create']);
    expect(result).toMatchObject({
      approved: false,
      clientSecret: 'pi_test_123_secret',
      paymentIntentId: 'pi_test_123',
      type: 'CREDIT_CARD',
    });
    expect(fraudEngine.evaluate).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      buyerEmail: 'cliente@example.com',
      buyerCpf: '123.456.789-09',
      buyerCnpj: null,
      buyerIp: '127.0.0.1',
      deviceFingerprint: null,
      cardBin: null,
      amountCents: 13_990n,
    });
  });

  it('creates a PIX payment, persists QR data, and returns the qr payload for the pix page', async () => {
    stripeCharge.createSaleCharge.mockResolvedValueOnce(
      makeChargeResult({
        paymentIntentId: 'pi_pix_1',
        clientSecret: 'pi_pix_1_secret',
        stripePaymentIntent: {
          id: 'pi_pix_1',
          status: 'requires_action',
          next_action: {
            type: 'pix_display_qr_code',
            pix_display_qr_code: {
              data: '000201pixcopiaecola',
              image_url_png: 'data:image/png;base64,qr',
              hosted_instructions_url: 'https://pay.stripe.com/pix/pi_pix_1',
              expires_at: 1_800_000_000,
            },
          },
        },
      }),
    );

    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_pix_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));

    const result = await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Pix',
      customerEmail: 'pix@example.com',
      paymentMethod: 'PIX',
      totalInCents: 10_000,
    });

    expect(stripeCharge.createSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodTypes: ['pix'],
        confirm: true,
        paymentMethodData: expect.objectContaining({
          type: 'pix',
          billing_details: expect.objectContaining({
            name: 'Cliente Pix',
            email: 'pix@example.com',
          }),
        }),
      }),
    );
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'stripe',
          externalId: 'pi_pix_1',
          pixQrCode: 'data:image/png;base64,qr',
          pixCopyPaste: '000201pixcopiaecola',
          status: 'PENDING',
        }),
      }),
    );
    expect(result).toMatchObject({
      approved: false,
      paymentIntentId: 'pi_pix_1',
      pixQrCode: 'data:image/png;base64,qr',
      pixCopyPaste: '000201pixcopiaecola',
      type: 'PIX',
    });
  });

  it('creates the seller connect account automatically when the workspace does not have one yet', async () => {
    prisma.connectAccountBalance.findFirst.mockResolvedValueOnce(null);
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_card_2',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));

    await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente',
      customerEmail: 'cliente@example.com',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(connectService.createCustomAccount).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountType: 'SELLER',
      email: 'owner@example.com',
      displayName: 'Workspace Teste',
    });
    expect(stripeCharge.createSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerStripeAccountId: 'acct_seller_created',
      }),
    );
  });

  it('rethrows Stripe errors and notifies FinancialAlertService', async () => {
    const stripeError = new Error('stripe unavailable');
    stripeCharge.createSaleCharge.mockRejectedValueOnce(stripeError);

    await expect(
      service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente',
        customerEmail: 'cliente@example.com',
        paymentMethod: 'PIX',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow('stripe unavailable');

    expect(financialAlert.paymentFailed).toHaveBeenCalledWith(
      stripeError,
      expect.objectContaining({
        workspaceId: 'ws-1',
        orderId: 'order-1',
        gateway: 'stripe',
      }),
    );
  });

  it('blocks the checkout before hitting Stripe when the antifraud engine returns block', async () => {
    fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'block',
      score: 1,
      reasons: [{ signal: 'blacklist', detail: 'CPF matched: auto_chargeback' }],
    });

    await expect(
      service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente Bloqueado',
        customerEmail: 'blocked@example.com',
        customerCPF: '123.456.789-09',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      action: 'CHECKOUT_PAYMENT_BLOCKED_BY_FRAUD',
      resource: 'CheckoutOrder',
      resourceId: 'order-1',
      details: {
        orderId: 'order-1',
        paymentMethod: 'CREDIT_CARD',
        chargedTotalInCents: 13_990,
        fraudDecision: {
          action: 'block',
          score: 1,
          reasonSignals: ['blacklist'],
          reasons: [{ signal: 'blacklist', detail: 'CPF matched: auto_chargeback' }],
        },
      },
    });
  });

  it('holds the checkout for manual review before hitting Stripe when the antifraud engine returns review', async () => {
    fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'review',
      score: 0.6,
      reasons: [{ signal: 'velocity', detail: 'too many attempts from same device' }],
    });

    await expect(
      service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente Em Revisão',
        customerEmail: 'review@example.com',
        customerCPF: '123.456.789-09',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      action: 'CHECKOUT_PAYMENT_REVIEW_REQUIRED',
      resource: 'CheckoutOrder',
      resourceId: 'order-1',
      details: {
        orderId: 'order-1',
        paymentMethod: 'CREDIT_CARD',
        chargedTotalInCents: 13_990,
        fraudDecision: {
          action: 'review',
          score: 0.6,
          reasonSignals: ['velocity'],
          reasons: [{ signal: 'velocity', detail: 'too many attempts from same device' }],
        },
      },
    });
  });

  it('forces 3DS on card payments when the antifraud engine returns require_3ds', async () => {
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_3ds_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));
    fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'require_3ds',
      score: 0.4,
      reasons: [{ signal: 'high_amount', detail: 'step-up required' }],
    });

    await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente 3DS',
      customerEmail: '3ds@example.com',
      customerCPF: '123.456.789-09',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(stripeCharge.createSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodTypes: ['card'],
        paymentMethodOptions: {
          card: {
            request_three_d_secure: 'any',
          },
        },
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      action: 'CHECKOUT_PAYMENT_3DS_REQUIRED',
      resource: 'CheckoutOrder',
      resourceId: 'order-1',
      details: {
        orderId: 'order-1',
        paymentMethod: 'CREDIT_CARD',
        chargedTotalInCents: 13_990,
        fraudDecision: {
          action: 'require_3ds',
          score: 0.4,
          reasonSignals: ['high_amount'],
          reasons: [{ signal: 'high_amount', detail: 'step-up required' }],
        },
      },
    });
  });
});
