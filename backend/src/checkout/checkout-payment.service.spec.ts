import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { ConnectService } from '../payments/connect/connect.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPaymentService } from './checkout-payment.service';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import {
  makeOrder,
  makeChargeResult,
  type CheckoutPaymentCreateArgs,
  type CheckoutPaymentTxClient,
  type CheckoutPaymentTxCallback,
  type CheckoutPaymentPrismaMock,
} from './checkout-payment.service.fixtures';
import {
  CHECKOUT_PAYMENT_E2E_GUARD,
  EnvCheckoutPaymentE2EGuard,
} from './checkout-payment-e2e-guard';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';

describe('CheckoutPaymentService.processPayment — provider routing', () => {
  let service: CheckoutPaymentService;
  let prisma: CheckoutPaymentPrismaMock;
  let stripeCharge: { createSaleCharge: jest.Mock };
  let mercadoPagoPix: { create: jest.Mock };
  let connectService: { createCustomAccount: jest.Mock };
  let fraudEngine: { evaluate: jest.Mock };
  let financialAlert: { paymentFailed: jest.Mock };
  let auditService: { log: jest.Mock; logWithTx: jest.Mock };
  let socialLeadService: { markConvertedFromOrder: jest.Mock };
  let postPaymentEffects: {
    markLeadConverted: jest.Mock;
    sendPurchaseSignals: jest.Mock;
  };

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
    mercadoPagoPix = {
      create: jest.fn().mockResolvedValue({
        externalId: 'mp_pix_1',
        status: 'pending',
        qrCode: '000201mp-pix-copia-e-cola',
        qrCodeBase64: 'base64-mp-qr',
        ticketUrl: 'https://www.mercadopago.com.br/payments/mp_pix_1/ticket',
        expiresAt: new Date('2026-06-01T12:00:00.000Z'),
        raw: { id: 'mp_pix_1', status: 'pending' },
      }),
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
    postPaymentEffects = {
      markLeadConverted: jest.fn().mockResolvedValue(undefined),
      sendPurchaseSignals: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeChargeService, useValue: stripeCharge },
        { provide: MercadoPagoPixChargeService, useValue: mercadoPagoPix },
        { provide: ConnectService, useValue: connectService },
        { provide: FraudEngine, useValue: fraudEngine },
        { provide: FinancialAlertService, useValue: financialAlert },
        { provide: AuditService, useValue: auditService },
        { provide: CheckoutSocialLeadService, useValue: socialLeadService },
        {
          provide: CHECKOUT_PAYMENT_E2E_GUARD,
          useValue: { isEnabled: jest.fn().mockReturnValue(false), buildResult: jest.fn() },
        },
        {
          provide: CheckoutEventEmitterService,
          useValue: {
            paymentInitiated: jest.fn().mockResolvedValue(undefined),
            paymentApproved: jest.fn().mockResolvedValue(undefined),
            paymentDeclined: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: CheckoutPostPaymentEffectsService, useValue: postPaymentEffects },
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
        findFirst: jest.fn().mockResolvedValue(null),
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
        marketplaceFeeCents: 990n,
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
    expect(postPaymentEffects.markLeadConverted).not.toHaveBeenCalled();
    expect(postPaymentEffects.sendPurchaseSignals).not.toHaveBeenCalled();
    expect(fraudEngine.evaluate).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      buyerEmail: 'cliente@example.com',
      buyerCpf: '123.456.789-09',
      buyerCnpj: null,
      buyerIp: '127.0.0.1',
      deviceFingerprint: null,
      cardBin: null,
      cardCountry: null,
      orderCountry: 'BR',
      amountCents: 13_990n,
    });
  });

  it('creates a PIX payment through Mercado Pago, persists QR data, and never calls Stripe', async () => {
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
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
      idempotencyKey: 'idem-pix-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Pix',
      customerEmail: 'pix@example.com',
      customerCPF: '12345678909',
      customerPhone: '11999999999',
      paymentMethod: 'PIX',
      totalInCents: 10_000,
    });

    expect(stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(mercadoPagoPix.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 13_990n,
        description: 'Produto X',
        externalReference: 'order-1',
        idempotencyKey: 'idem-pix-1',
        notificationUrl: expect.stringContaining('/webhooks/mercadopago'),
        payerDocument: '12345678909',
        payerEmail: 'pix@example.com',
        payerName: 'Cliente Pix',
      }),
    );
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'mercadopago',
          externalId: 'mp_pix_1',
          pixQrCode: 'data:image/png;base64,base64-mp-qr',
          pixCopyPaste: '000201mp-pix-copia-e-cola',
          status: 'PENDING',
        }),
      }),
    );
    expect(result).toMatchObject({
      approved: false,
      clientSecret: null,
      paymentIntentId: 'mp_pix_1',
      pixQrCode: 'data:image/png;base64,base64-mp-qr',
      pixCopyPaste: '000201mp-pix-copia-e-cola',
      type: 'PIX',
    });
  });

  it('creates the seller connect account automatically when the workspace does not have one yet', async () => {
    prisma.connectAccountBalance.findFirst.mockResolvedValueOnce(null);
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
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

  it('runs post-payment effects when the payment is approved', async () => {
    stripeCharge.createSaleCharge.mockResolvedValueOnce(
      makeChargeResult({
        stripePaymentIntent: {
          id: 'pi_approved_1',
          status: 'succeeded',
          next_action: null,
        },
      }),
    );
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_approved_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(async () => ({ status: 'PENDING' })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));

    const result = await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Aprovado',
      customerEmail: 'approved@example.com',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(result.approved).toBe(true);
    expect(postPaymentEffects.markLeadConverted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
      'ws-1',
    );
    expect(postPaymentEffects.sendPurchaseSignals).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
      139.9,
    );
  });

  it('rethrows Stripe card errors and notifies FinancialAlertService', async () => {
    const stripeError = new Error('stripe unavailable');
    stripeCharge.createSaleCharge.mockRejectedValueOnce(stripeError);

    await expect(
      service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente',
        customerEmail: 'cliente@example.com',
        paymentMethod: 'CREDIT_CARD',
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
        findFirst: jest.fn().mockResolvedValue(null),
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

describe('EnvCheckoutPaymentE2EGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('enables the CI checkout stub only when Stripe is not configured outside production', () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.CI = 'true';
    process.env.NODE_ENV = 'test';

    const guard = new EnvCheckoutPaymentE2EGuard();

    expect(guard.isEnabled()).toBe(true);
    expect(guard.buildResult({ orderId: 'order-1', paymentMethod: 'PIX' })).toMatchObject({
      type: 'PIX',
      approved: false,
      paymentIntentId: 'pi_e2e_order-1',
      pixCopyPaste: '000201E2EPIXorder-1',
      stub: true,
    });
  });

  it('does not enable the checkout stub in production', () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.CHECKOUT_PAYMENT_E2E_STUB = 'true';
    process.env.CI = 'true';
    process.env.NODE_ENV = 'production';

    const guard = new EnvCheckoutPaymentE2EGuard();

    expect(guard.isEnabled()).toBe(false);
  });
});
