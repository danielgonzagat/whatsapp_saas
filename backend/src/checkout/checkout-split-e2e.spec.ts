import { Test, type TestingModule } from '@nestjs/testing';

import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { ConnectService } from '../payments/connect/connect.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPaymentService } from './checkout-payment.service';
import { CHECKOUT_PAYMENT_E2E_GUARD } from './checkout-payment-e2e-guard';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import {
  type CheckoutPaymentCreateArgs,
  type CheckoutPaymentPrismaMock,
  type CheckoutPaymentTxCallback,
  type CheckoutPaymentTxClient,
  makeChargeResult,
  makeOrder,
} from './checkout-payment.service.fixtures';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';

const SELLER_ACCOUNT_BALANCE = Object.freeze({
  id: 'cab_seller_1',
  stripeAccountId: 'acct_seller_1',
  accountType: 'SELLER',
  workspaceId: 'ws-1',
});

const SELLER_WORKSPACE = Object.freeze({
  agents: [{ email: 'owner@example.com' }],
  id: 'ws-1',
  name: 'Workspace Teste',
});

describe('Checkout E2E Split Chain', () => {
  let service: CheckoutPaymentService;
  let prisma: CheckoutPaymentPrismaMock;
  let stripeCharge: { createSaleCharge: jest.Mock };
  let mercadoPagoBoleto: { create: jest.Mock };
  let mercadoPagoPix: { create: jest.Mock };
  let connectService: { createCustomAccount: jest.Mock };
  let fraudEngine: { evaluate: jest.Mock };
  let financialAlert: { paymentFailed: jest.Mock };
  let auditService: { log: jest.Mock; logWithTx: jest.Mock };
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
        findFirst: jest.fn().mockResolvedValue(SELLER_ACCOUNT_BALANCE),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue(SELLER_WORKSPACE),
      },
      $transaction: jest.fn(),
    };

    stripeCharge = {
      createSaleCharge: jest.fn().mockResolvedValue(makeChargeResult()),
    };
    mercadoPagoBoleto = {
      create: jest.fn().mockResolvedValue({
        externalId: 'mp_boleto_split_1',
        status: 'pending',
        ticketUrl: 'https://www.mercadopago.com.br/payments/mp_boleto_split_1/ticket',
        barcodeContent: '23793381286000000000123456789012345678901234',
        digitableLine: '23793.38128 60000.000001 12345.678901 2 99990000013990',
        expiresAt: new Date('2026-06-03T12:00:00.000Z'),
        raw: { id: 'mp_boleto_split_1', status: 'pending' },
      }),
    };
    mercadoPagoPix = {
      create: jest.fn().mockResolvedValue({
        externalId: 'mp_pix_split_1',
        status: 'pending',
        qrCode: '000201mp-split-copia-e-cola',
        qrCodeBase64: 'base64-mp-split-qr',
        ticketUrl: 'https://www.mercadopago.com.br/payments/mp_pix_split_1/ticket',
        expiresAt: new Date('2026-06-01T12:00:00.000Z'),
        raw: { id: 'mp_pix_split_1', status: 'pending' },
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
    postPaymentEffects = {
      markLeadConverted: jest.fn().mockResolvedValue(undefined),
      sendPurchaseSignals: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeChargeService, useValue: stripeCharge },
        { provide: MercadoPagoBoletoChargeService, useValue: mercadoPagoBoleto },
        { provide: MercadoPagoPixChargeService, useValue: mercadoPagoPix },
        { provide: ConnectService, useValue: connectService },
        { provide: FraudEngine, useValue: fraudEngine },
        { provide: FinancialAlertService, useValue: financialAlert },
        { provide: AuditService, useValue: auditService },
        { provide: CheckoutSocialLeadService, useValue: { markConvertedFromOrder: jest.fn() } },
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

  function setupTx(findFirstResult?: unknown) {
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_split_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));
    return tx;
  }

  it('calls StripeChargeService with split-aware input containing marketplaceFee and interest breakdown', async () => {
    setupTx();

    await service.processPayment({
      customerCPF: '123.456.789-09',
      customerEmail: 'split@example.com',
      customerName: 'Cliente Split',
      installments: 3,
      orderId: 'order-1',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
      workspaceId: 'ws-1',
    });

    expect(stripeCharge.createSaleCharge).toHaveBeenCalledTimes(1);
    const chargeInput = stripeCharge.createSaleCharge.mock.calls[0][0];
    expect(chargeInput.buyerPaidCents).toBe(13_990n);
    expect(chargeInput.saleValueCents).toBe(10_000n);
    expect(chargeInput.marketplaceFeeCents).toBe(990n);
    expect(chargeInput.interestCents).toBe(3_990n);
    expect(chargeInput.sellerStripeAccountId).toBe('acct_seller_1');
    expect(chargeInput.workspaceId).toBe('ws-1');
    expect(chargeInput.idempotencyKey).toBe('order-1');
  });

  it('persists the card split result inside the checkout payment webhookData for downstream webhook processing', async () => {
    const tx = setupTx();

    const chargeWithSplit = makeChargeResult({
      split: {
        kloelTotalCents: 4_980n,
        residueCents: 0n,
        splits: [
          { role: 'seller', accountId: 'acct_seller_1', amountCents: 5_020n },
          { role: 'supplier', accountId: 'acct_supplier_1', amountCents: 2_500n },
          { role: 'affiliate', accountId: 'acct_affiliate_1', amountCents: 1_287n },
        ],
      },
      splitInput: {
        buyerPaidCents: 13_990n,
        saleValueCents: 10_000n,
        interestCents: 3_990n,
        marketplaceFeeCents: 990n,
        seller: { accountId: 'acct_seller_1' },
        supplier: { accountId: 'acct_supplier_1', amountCents: 2_500n },
        affiliate: { accountId: 'acct_affiliate_1', percentBp: 1_287 },
      },
    });
    stripeCharge.createSaleCharge.mockResolvedValueOnce(chargeWithSplit);

    await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente MultiSplit',
      customerEmail: 'multisplit@example.com',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(mercadoPagoPix.create).not.toHaveBeenCalled();
    expect(mercadoPagoBoleto.create).not.toHaveBeenCalled();
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookData: expect.objectContaining({
            provider: 'stripe',
            split: expect.objectContaining({
              kloelTotalCents: '4980',
              residueCents: '0',
              splits: expect.arrayContaining([
                expect.objectContaining({ role: 'seller', amountCents: '5020' }),
                expect.objectContaining({ role: 'supplier', amountCents: '2500' }),
                expect.objectContaining({ role: 'affiliate', amountCents: '1287' }),
              ]),
            }),
            splitInput: expect.objectContaining({
              buyerPaidCents: '13990',
              saleValueCents: '10000',
              marketplaceFeeCents: '990',
              interestCents: '3990',
            }),
          }),
        }),
      }),
    );
  });

  it('handles idempotent payments when the same order is processed twice with the same PaymentIntent', async () => {
    const existingPayment = { id: 'pay_existing', externalId: 'pi_test_123' };
    setupTx(existingPayment);

    await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Duplicado',
      customerEmail: 'dupe@example.com',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(stripeCharge.createSaleCharge).toHaveBeenCalledTimes(1);
  });

  it('routes PIX split checkout payments through Mercado Pago and never asks Stripe for Pix artifacts', async () => {
    const tx = setupTx();

    const result = await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente PIX Split',
      customerEmail: 'pixsplit@example.com',
      customerCPF: '123.456.789-09',
      paymentMethod: 'PIX',
      totalInCents: 10_000,
    });

    expect(stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(mercadoPagoBoleto.create).not.toHaveBeenCalled();
    expect(mercadoPagoPix.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 13_990n,
        externalReference: 'order-1',
        idempotencyKey: 'order-1',
        notificationUrl: expect.stringContaining('/webhooks/mercadopago'),
        payerDocument: '12345678909',
        payerEmail: 'pixsplit@example.com',
        payerName: 'Cliente PIX Split',
      }),
    );
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'mercadopago',
          externalId: 'mp_pix_split_1',
          pixQrCode: 'data:image/png;base64,base64-mp-split-qr',
          pixCopyPaste: '000201mp-split-copia-e-cola',
          status: 'PENDING',
          webhookData: expect.objectContaining({
            provider: 'mercadopago',
            paymentMethod: 'pix',
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      clientSecret: null,
      paymentIntentId: 'mp_pix_split_1',
      pixQrCode: 'data:image/png;base64,base64-mp-split-qr',
      pixCopyPaste: '000201mp-split-copia-e-cola',
      type: 'PIX',
    });
  });
});
