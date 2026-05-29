import { Test, type TestingModule } from '@nestjs/testing';

import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { ConnectService } from '../payments/connect/connect.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { PaymentProviderRouterService } from '../payments/provider-router/provider-router.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPaymentService } from './checkout-payment.service';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import {
  makeOrder,
  makeChargeResult,
  type CheckoutPaymentPrismaMock,
} from './checkout-payment.service.fixtures';
import { CHECKOUT_PAYMENT_E2E_GUARD } from './checkout-payment-e2e-guard';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';

/**
 * Shared TestingModule harness for the CheckoutPaymentService spec family.
 *
 * The original `checkout-payment.service.spec.ts` mixed provider-routing,
 * fraud-engine, and E2E-guard expectations in a single 720-LOC file. The
 * Gate-fix2-D split (2026-05-28) carves the suite into themed sub-specs;
 * this harness centralizes the heavy mock setup so each sub-spec stays focused
 * on assertions.
 */

export interface CheckoutPaymentServiceTestEnv {
  service: CheckoutPaymentService;
  prisma: CheckoutPaymentPrismaMock;
  stripeCharge: { createSaleCharge: jest.Mock };
  mercadoPagoBoleto: { create: jest.Mock };
  mercadoPagoPix: { create: jest.Mock };
  providerRouter: { resolve: jest.Mock };
  connectService: { createCustomAccount: jest.Mock };
  fraudEngine: { evaluate: jest.Mock };
  financialAlert: { paymentFailed: jest.Mock };
  auditService: { log: jest.Mock; logWithTx: jest.Mock };
  socialLeadService: { markConvertedFromOrder: jest.Mock };
  postPaymentEffects: {
    markLeadConverted: jest.Mock;
    sendPurchaseSignals: jest.Mock;
  };
}

/**
 * Build a fresh CheckoutPaymentService instance with all collaborators stubbed
 * to the "happy path" defaults. Individual sub-specs override the relevant
 * mocks per-test (e.g. `prisma.checkoutOrder.findFirst.mockResolvedValueOnce`).
 */
export async function buildCheckoutPaymentServiceTestEnv(): Promise<CheckoutPaymentServiceTestEnv> {
  const prisma: CheckoutPaymentPrismaMock = {
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

  const stripeCharge = {
    createSaleCharge: jest.fn().mockResolvedValue(makeChargeResult()),
  };
  const mercadoPagoBoleto = {
    create: jest.fn().mockResolvedValue({
      externalId: 'mp_boleto_1',
      status: 'pending',
      ticketUrl: 'https://www.mercadopago.com.br/payments/mp_boleto_1/ticket',
      barcodeContent: '23793381286000000000123456789012345678901234',
      digitableLine: '23793.38128 60000.000001 12345.678901 2 99990000013990',
      expiresAt: new Date('2026-06-03T12:00:00.000Z'),
      raw: { id: 'mp_boleto_1', status: 'pending' },
    }),
  };
  const mercadoPagoPix = {
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
  const providerRouter = {
    resolve: jest.fn(({ method }: { method: 'pix' | 'card' | 'boleto' }) =>
      PaymentProviderRouterService.resolveStatic(method),
    ),
  };
  const connectService = {
    createCustomAccount: jest.fn().mockResolvedValue({
      accountBalanceId: 'cab_seller_created',
      stripeAccountId: 'acct_seller_created',
      requestedCapabilities: ['card_payments', 'transfers'],
    }),
  };
  const fraudEngine = {
    evaluate: jest.fn().mockResolvedValue({
      action: 'allow',
      score: 0,
      reasons: [],
    }),
  };
  const financialAlert = { paymentFailed: jest.fn() };
  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
    logWithTx: jest.fn().mockResolvedValue(undefined),
  };
  const socialLeadService = { markConvertedFromOrder: jest.fn().mockResolvedValue(null) };
  const postPaymentEffects = {
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
      { provide: PaymentProviderRouterService, useValue: providerRouter },
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

  const service = moduleRef.get(CheckoutPaymentService);

  return {
    service,
    prisma,
    stripeCharge,
    mercadoPagoBoleto,
    mercadoPagoPix,
    providerRouter,
    connectService,
    fraudEngine,
    financialAlert,
    auditService,
    socialLeadService,
    postPaymentEffects,
  };
}
