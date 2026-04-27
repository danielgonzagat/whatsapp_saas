import { Test, type TestingModule } from '@nestjs/testing';

import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { ConnectService } from '../payments/connect/connect.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPaymentService } from './checkout-payment.service';
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

describe('Checkout E2E Split Chain', () => {
  let service: CheckoutPaymentService;
  let prisma: CheckoutPaymentPrismaMock;
  let stripeCharge: { createSaleCharge: jest.Mock };
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
        findFirst: jest.fn().mockResolvedValue({
          id: 'cab_seller_1',
          stripeAccountId: 'acct_seller_1',
          accountType: 'SELLER',
          workspaceId: 'ws-1',
        }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          agents: [{ email: 'owner@example.com' }],
          id: 'ws-1',
          name: 'Workspace Teste',
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
    postPaymentEffects = {
      markLeadConverted: jest.fn().mockResolvedValue(undefined),
      sendPurchaseSignals: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeChargeService, useValue: stripeCharge },
        { provide: ConnectService, useValue: connectService },
        { provide: FraudEngine, useValue: fraudEngine },
        { provide: FinancialAlertService, useValue: financialAlert },
        { provide: AuditService, useValue: auditService },
        { provide: CheckoutSocialLeadService, useValue: { markConvertedFromOrder: jest.fn() } },
        { provide: CheckoutPostPaymentEffectsService, useValue: postPaymentEffects },
      ],
    }).compile();

    service = moduleRef.get(CheckoutPaymentService);
  });

  function setupTx(findFirstResult: unknown = undefined) {
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

  it('persists the split result inside the checkout payment webhookData for downstream webhook processing', async () => {
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
      paymentMethod: 'PIX',
      totalInCents: 10_000,
    });

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

  it('propagates PIX qr code and copy-paste data from the Stripe response into the payment record', async () => {
    setupTx();

    stripeCharge.createSaleCharge.mockResolvedValueOnce(
      makeChargeResult({
        paymentIntentId: 'pi_pix_split',
        clientSecret: 'pi_pix_split_secret',
        stripePaymentIntent: {
          id: 'pi_pix_split',
          status: 'requires_action',
          next_action: {
            type: 'pix_display_qr_code',
            pix_display_qr_code: {
              data: '000201pixcopiaecola',
              image_url_png: 'data:image/png;base64,qr',
              hosted_instructions_url: 'https://pay.stripe.com/pix/pi_pix_split',
              expires_at: 1_810_000_000,
            },
          },
        },
      }),
    );

    const result = await service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente PIX Split',
      customerEmail: 'pixsplit@example.com',
      paymentMethod: 'PIX',
      totalInCents: 10_000,
    });

    expect(result.pixQrCode).toBe('data:image/png;base64,qr');
    expect(result.pixCopyPaste).toBe('000201pixcopiaecola');
    expect(result.paymentIntentId).toBe('pi_pix_split');
  });
});
