import { BadRequestException } from '@nestjs/common';
import * as Sentry from '@sentry/node';

import type { StructuredLogger } from '../logging/structured-logger';
import type { FinancialAlertService } from '../common/financial-alert.service';
import type { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import type { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import type { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';
import type { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { sanitizeDocumentDigits } from '../sales/sales.helpers.shared';
import {
  BOLETO_EXPIRATION_DAYS,
  EMPTY_BOLETO_DATA,
  EMPTY_PIX_DATA,
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  buildCheckoutPaymentResult,
  buildMercadoPagoBoletoChargeInput,
  buildMercadoPagoBoletoDisplay,
  buildMercadoPagoPixChargeInput,
  buildMercadoPagoPixDisplay,
  buildPaymentBreadcrumb,
  buildStripeChargeInput,
  extractProductName,
  finalizeApprovedCheckoutPayment,
  mapMercadoPagoPaymentStatus,
  mapStripePaymentStatus,
  normalizeBoletoAddress,
  reportCheckoutPaymentFailure,
  resolveBackendOrigin,
  type CheckoutPaymentMethod,
  type CheckoutPaymentStatus,
  type PixDisplayData,
} from './checkout-payment.helpers';

/**
 * Per-call parameters shared by every checkout payment arm. Mirrors the public
 * `processPayment` signature without re-coupling to the service class.
 */
export type CheckoutPaymentArmParams = {
  orderId: string;
  idempotencyKey?: string;
  workspaceId: string;
  customerName: string;
  customerEmail: string;
  customerCPF?: string;
  customerPhone?: string;
  paymentMethod: CheckoutPaymentMethod;
  totalInCents: number;
  installments?: number;
  cardHolderName?: string;
  cardLast4?: string;
};

/** Minimal checkout-order shape required by the per-arm processors. */
export type CheckoutPaymentArmOrder = {
  plan: unknown;
  shippingAddress: unknown;
} & {
  // Required for runApprovedCheckoutPostPaymentEffects via finalizeApprovedCheckoutPayment.
  // Forwarded verbatim; the per-arm code does not inspect it.
  [key: string]: unknown;
};

type StripeSaleCharge = Awaited<ReturnType<StripeChargeService['createSaleCharge']>>;
type MercadoPagoPixCharge = Awaited<ReturnType<MercadoPagoPixChargeService['create']>>;
type MercadoPagoBoletoCharge = Awaited<ReturnType<MercadoPagoBoletoChargeService['create']>>;

/**
 * Dependency bundle injected once per arm call so the per-arm processors stay
 * pure orchestration. No money math here; persistence delegated to caller-owned
 * `persist*` lambdas which run the shared transactional kernel.
 */
export type CheckoutPaymentArmDeps = {
  logger: Pick<InstanceType<typeof StructuredLogger>, 'log' | 'warn' | 'error'>;
  eventEmitter: CheckoutEventEmitterService | undefined;
  postPaymentEffects: CheckoutPostPaymentEffectsService;
  financialAlert: FinancialAlertService;
  mercadoPagoPix: MercadoPagoPixChargeService;
  mercadoPagoBoleto: MercadoPagoBoletoChargeService;
  stripeCharge: StripeChargeService;
};

function addPaymentBreadcrumb(
  params: CheckoutPaymentArmParams,
  amount: number,
  providerLabel: string,
  kindPrefix = '',
): void {
  Sentry.addBreadcrumb(
    buildPaymentBreadcrumb({
      message: `checkout ${kindPrefix}payment processing via ${providerLabel}`,
      orderId: params.orderId,
      workspaceId: params.workspaceId,
      amount,
      paymentMethod: params.paymentMethod,
    }),
  );
}

function reportArmFailure(
  deps: Pick<CheckoutPaymentArmDeps, 'eventEmitter' | 'logger' | 'financialAlert'>,
  params: CheckoutPaymentArmParams,
  amount: number,
  gateway: 'stripe' | 'mercadopago',
  operation: string,
  logPrefix: string,
  error: unknown,
): void {
  reportCheckoutPaymentFailure({
    emitter: deps.eventEmitter,
    logger: deps.logger,
    sentryCapture: Sentry.captureException,
    financialAlert: deps.financialAlert,
    workspaceId: params.workspaceId,
    orderId: params.orderId,
    correlationId: params.idempotencyKey,
    amount,
    gateway,
    operation,
    logPrefix,
    error,
  });
}

function finalizeArm(
  deps: Pick<CheckoutPaymentArmDeps, 'eventEmitter' | 'postPaymentEffects' | 'logger'>,
  params: CheckoutPaymentArmParams,
  order: CheckoutPaymentArmOrder,
  paymentIntentId: string,
  chargedTotalInCents: number,
  amount: number,
  approved: boolean,
): Promise<void> {
  return finalizeApprovedCheckoutPayment({
    emitter: deps.eventEmitter,
    postPaymentEffects: deps.postPaymentEffects,
    logger: deps.logger,
    order: order,
    workspaceId: params.workspaceId,
    orderId: params.orderId,
    paymentIntentId,
    paymentMethod: params.paymentMethod,
    amountInCents: chargedTotalInCents,
    amount,
    correlationId: params.idempotencyKey,
    approved,
  });
}

/**
 * Run the Mercado Pago PIX checkout payment arm. Pure orchestration: builds the
 * provider charge input, persists the row via the caller-supplied `persist`
 * lambda (which owns the shared transactional kernel + money fields), fires the
 * lifecycle events, and on failure invokes the unified reporting trifecta.
 * Money path preserved — no arithmetic and no DB writes here.
 */
export async function runCheckoutPixArm(input: {
  deps: CheckoutPaymentArmDeps;
  params: CheckoutPaymentArmParams;
  order: CheckoutPaymentArmOrder;
  amount: number;
  chargedTotalInCents: number;
  persist: (
    charge: MercadoPagoPixCharge,
    paymentStatus: CheckoutPaymentStatus,
    pixData: PixDisplayData,
    amount: number,
  ) => Promise<unknown>;
}): Promise<ReturnType<typeof buildCheckoutPaymentResult>> {
  const { deps, params, order, amount, chargedTotalInCents, persist } = input;
  try {
    addPaymentBreadcrumb(params, amount, 'Mercado Pago');
    const productName = extractProductName(order.plan);
    const payerDocument =
      params.customerCPF != null
        ? sanitizeDocumentDigits(params.customerCPF) || undefined
        : undefined;
    const charge = await deps.mercadoPagoPix.create(
      buildMercadoPagoPixChargeInput({
        idempotencyKey: params.idempotencyKey || params.orderId,
        chargedTotalInCents,
        payerEmail: params.customerEmail,
        payerName: params.customerName,
        ...(payerDocument !== undefined ? { payerDocument } : {}),
        productName,
        orderId: params.orderId,
        expiresAt: new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000),
        notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
      }),
    );
    const pixData: PixDisplayData = buildMercadoPagoPixDisplay(charge);
    const paymentStatus = mapMercadoPagoPaymentStatus(charge.status);
    const approved = paymentStatus === 'APPROVED';
    const payment = await persist(charge, paymentStatus, pixData, amount);
    await finalizeArm(
      deps,
      params,
      order,
      charge.externalId,
      chargedTotalInCents,
      amount,
      approved,
    );
    return buildCheckoutPaymentResult({
      payment,
      type: params.paymentMethod,
      approved,
      clientSecret: null,
      paymentIntentId: charge.externalId,
      pixData,
      boletoData: EMPTY_BOLETO_DATA,
    });
  } catch (error: unknown) {
    reportArmFailure(
      deps,
      params,
      amount,
      'mercadopago',
      'checkout_mercadopago_pix_payment',
      'Mercado Pago PIX processing failed',
      error,
    );
    throw error;
  }
}

/**
 * Run the Mercado Pago boleto checkout payment arm. Same contract as
 * `runCheckoutPixArm`. Throws BadRequestException pre-charge when payer
 * document or address is missing. Money path preserved.
 */
export async function runCheckoutBoletoArm(input: {
  deps: CheckoutPaymentArmDeps;
  params: CheckoutPaymentArmParams;
  order: CheckoutPaymentArmOrder;
  amount: number;
  chargedTotalInCents: number;
  persist: (
    charge: MercadoPagoBoletoCharge,
    paymentStatus: CheckoutPaymentStatus,
    amount: number,
  ) => Promise<unknown>;
}): Promise<ReturnType<typeof buildCheckoutPaymentResult>> {
  const { deps, params, order, amount, chargedTotalInCents, persist } = input;
  const payerDocument =
    params.customerCPF != null ? sanitizeDocumentDigits(params.customerCPF) : '';
  if (!payerDocument) {
    throw new BadRequestException(
      'CPF/CNPJ do comprador é obrigatório para emitir boleto pelo Mercado Pago.',
    );
  }
  const payerAddress = normalizeBoletoAddress(order.shippingAddress);
  if (!payerAddress) {
    throw new BadRequestException(
      'Endereço completo do comprador é obrigatório para emitir boleto pelo Mercado Pago.',
    );
  }

  try {
    addPaymentBreadcrumb(params, amount, 'Mercado Pago', 'boleto ');
    const productName = extractProductName(order.plan);
    const charge = await deps.mercadoPagoBoleto.create(
      buildMercadoPagoBoletoChargeInput({
        idempotencyKey: params.idempotencyKey || params.orderId,
        chargedTotalInCents,
        payerEmail: params.customerEmail,
        payerName: params.customerName,
        payerDocument,
        payerAddress,
        productName,
        orderId: params.orderId,
        expiresAt: new Date(Date.now() + BOLETO_EXPIRATION_DAYS * 24 * 60 * 60_000),
        notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
      }),
    );
    const paymentStatus = mapMercadoPagoPaymentStatus(charge.status);
    const approved = paymentStatus === 'APPROVED';
    const payment = await persist(charge, paymentStatus, amount);
    await finalizeArm(
      deps,
      params,
      order,
      charge.externalId,
      chargedTotalInCents,
      amount,
      approved,
    );
    return buildCheckoutPaymentResult({
      payment,
      type: params.paymentMethod,
      approved,
      clientSecret: null,
      paymentIntentId: charge.externalId,
      pixData: EMPTY_PIX_DATA,
      boletoData: buildMercadoPagoBoletoDisplay(charge),
    });
  } catch (error: unknown) {
    reportArmFailure(
      deps,
      params,
      amount,
      'mercadopago',
      'checkout_mercadopago_boleto_payment',
      'Mercado Pago boleto processing failed',
      error,
    );
    throw error;
  }
}

/**
 * Run the Stripe card checkout payment arm. Same contract as the Mercado Pago
 * arms; the seller Stripe account is resolved by the caller and passed in via
 * `money.sellerStripeAccountId`. Money path preserved — no arithmetic.
 */
export async function runCheckoutStripeArm(input: {
  deps: CheckoutPaymentArmDeps;
  params: CheckoutPaymentArmParams;
  order: CheckoutPaymentArmOrder & { plan?: { currency?: string | null } | null };
  amount: number;
  money: {
    sellerStripeAccountId: string;
    baseTotalInCents: number;
    chargedTotalInCents: number;
    marketplaceFeeInCents: number;
    interestInCents: number;
    forceThreeDS: boolean;
  };
  persist: (
    charge: StripeSaleCharge,
    paymentStatus: CheckoutPaymentStatus,
    pixData: PixDisplayData,
    amount: number,
  ) => Promise<unknown>;
}): Promise<ReturnType<typeof buildCheckoutPaymentResult>> {
  const { deps, params, order, amount, money, persist } = input;
  try {
    addPaymentBreadcrumb(params, amount, 'Stripe');
    const charge = await deps.stripeCharge.createSaleCharge(
      buildStripeChargeInput(params, {
        sellerStripeAccountId: money.sellerStripeAccountId,
        currency: String(order.plan?.currency || 'BRL'),
        baseTotalInCents: money.baseTotalInCents,
        chargedTotalInCents: money.chargedTotalInCents,
        marketplaceFeeInCents: money.marketplaceFeeInCents,
        interestInCents: money.interestInCents,
        forceThreeDS: money.forceThreeDS,
      }),
    );

    const paymentStatus = mapStripePaymentStatus(charge.stripePaymentIntent.status);
    const approved = paymentStatus === 'APPROVED';
    const pixData: PixDisplayData = EMPTY_PIX_DATA;
    const payment = await persist(charge, paymentStatus, pixData, amount);

    await finalizeArm(
      deps,
      params,
      order,
      charge.paymentIntentId,
      money.chargedTotalInCents,
      amount,
      approved,
    );

    return buildCheckoutPaymentResult({
      payment,
      type: params.paymentMethod,
      approved,
      clientSecret: charge.clientSecret,
      paymentIntentId: charge.paymentIntentId,
      pixData,
      boletoData: EMPTY_BOLETO_DATA,
    });
  } catch (error: unknown) {
    reportArmFailure(
      deps,
      params,
      amount,
      'stripe',
      'checkout_stripe_payment',
      'Stripe payment processing failed',
      error,
    );
    throw error;
  }
}
