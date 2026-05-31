import {
  type CheckoutPaymentMethod,
  type BoletoDisplayData,
  type PixDisplayData,
} from './checkout-payment.types';

/**
 * Pure input/output envelope builders for checkout payment arms. Split out from
 * `checkout-payment.helpers.ts` (Wave 83) and further sub-split (Gate-fix2-D,
 * 2026-05-28) so the Stripe and Mercado Pago arm builders live in dedicated
 * files:
 *
 *   - ./checkout-payment.stripe.builders        — Stripe input + Prisma envelope
 *   - ./checkout-payment.mercadopago.builders   — Mercado Pago PIX/boleto envelopes
 *
 * This file keeps the cross-provider builders (Sentry breadcrumb, capture
 * context, financial-alert context, audit payload, payment result) and
 * re-exports the provider-specific symbols so the historical import surface
 * via `./checkout-payment.helpers` stays byte-for-byte stable. Every export
 * remains side-effect-free. No money arithmetic anywhere.
 */

export { buildStripeChargeInput, buildStripePaymentData } from './checkout-payment.stripe.builders';

export {
  buildMercadoPagoBoletoChargeInput,
  buildMercadoPagoBoletoPaymentData,
  buildMercadoPagoPixChargeInput,
  buildMercadoPagoPixPaymentData,
} from './checkout-payment.mercadopago.builders';

/** Sentry breadcrumb level used for checkout payment lifecycle events. */
type PaymentBreadcrumbInput = {
  message: string;
  orderId: string;
  workspaceId: string;
  amount: number;
  paymentMethod: CheckoutPaymentMethod;
};

/** Build a Sentry breadcrumb payload for a checkout payment lifecycle step. Pure. */
export function buildPaymentBreadcrumb(input: PaymentBreadcrumbInput): {
  message: string;
  category: 'payment';
  level: 'info';
  data: {
    orderId: string;
    workspaceId: string;
    amount: number;
    paymentMethod: CheckoutPaymentMethod;
  };
} {
  return {
    message: input.message,
    category: 'payment',
    level: 'info',
    data: {
      orderId: input.orderId,
      workspaceId: input.workspaceId,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
    },
  };
}

/** Build a Sentry capture context for a payment-processing failure. Pure. */
export function buildPaymentCaptureContext(input: {
  operation: string;
  workspaceId: string;
  orderId: string;
  amount: number;
  gateway: 'stripe' | 'mercadopago';
}): {
  tags: { type: 'financial_alert'; operation: string };
  extra: { workspaceId: string; orderId: string; amount: number; gateway: string };
  level: 'fatal';
} {
  return {
    tags: { type: 'financial_alert', operation: input.operation },
    extra: {
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      amount: input.amount,
      gateway: input.gateway,
    },
    level: 'fatal',
  };
}

/** Build the financial-alert context for a payment-processing failure. Pure. */
export function buildFinancialAlertContext(input: {
  workspaceId: string;
  orderId: string;
  amount: number;
  gateway: 'stripe' | 'mercadopago';
}): { workspaceId: string; orderId: string; amount: number; gateway: 'stripe' | 'mercadopago' } {
  return {
    workspaceId: input.workspaceId,
    orderId: input.orderId,
    amount: input.amount,
    gateway: input.gateway,
  };
}

/**
 * Build the audit-log payload (`AuditService.logWithTx` second argument) for a
 * newly-created checkout payment. Centralizes the shape so the three persist arms
 * (Stripe card, Mercado Pago PIX, Mercado Pago boleto) emit identical envelopes.
 * Pure formatter — no money math, no I/O.
 */
export function buildCheckoutPaymentCreatedAuditPayload(input: {
  workspaceId: string;
  paymentId: string;
  paymentMethod: CheckoutPaymentMethod;
  amount: number;
  orderId: string;
  gateway: 'stripe' | 'mercadopago';
  externalId: string;
  approved: boolean;
  installments: number | undefined;
  providerPaymentStatus: string;
}): {
  workspaceId: string;
  action: 'CHECKOUT_PAYMENT_CREATED';
  resource: 'CheckoutPayment';
  resourceId: string;
  details: {
    method: CheckoutPaymentMethod;
    amount: number;
    orderId: string;
    gateway: 'stripe' | 'mercadopago';
    externalId: string;
    approved: boolean;
    installments: number | undefined;
    paymentStatus: string;
  };
} {
  return {
    workspaceId: input.workspaceId,
    action: 'CHECKOUT_PAYMENT_CREATED',
    resource: 'CheckoutPayment',
    resourceId: input.paymentId,
    details: {
      method: input.paymentMethod,
      amount: input.amount,
      orderId: input.orderId,
      gateway: input.gateway,
      externalId: input.externalId,
      approved: input.approved,
      installments: input.installments,
      paymentStatus: input.providerPaymentStatus,
    },
  };
}

/**
 * Build the canonical checkout-payment-result shape returned by `processPayment`
 * across all three payment-method arms. Pure formatter — no money math, no I/O.
 */
export function buildCheckoutPaymentResult<TPayment>(input: {
  payment: TPayment;
  type: CheckoutPaymentMethod;
  approved: boolean;
  clientSecret: string | null;
  paymentIntentId: string;
  pixData: PixDisplayData;
  boletoData: BoletoDisplayData;
}): {
  payment: TPayment;
  type: CheckoutPaymentMethod;
  approved: boolean;
  clientSecret: string | null;
  paymentIntentId: string;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
  boletoUrl: string | null;
  boletoBarcode: string | null;
  boletoExpiresAt: string | null;
} {
  return {
    payment: input.payment,
    type: input.type,
    approved: input.approved,
    clientSecret: input.clientSecret,
    paymentIntentId: input.paymentIntentId,
    pixQrCode: input.pixData.pixQrCode,
    pixCopyPaste: input.pixData.pixCopyPaste,
    pixExpiresAt: input.pixData.pixExpiresAt,
    boletoUrl: input.boletoData.boletoUrl,
    boletoBarcode: input.boletoData.boletoBarcode,
    boletoExpiresAt: input.boletoData.boletoExpiresAt,
  };
}

/**
 * Minimal Sentry-like surface used by the failure-reporting helper. Pure structural
 * type so the helper has zero coupling to `@sentry/node` — callers pass the real
 * `Sentry.captureException` from the module they already imported.
 */
export type CheckoutPaymentSentryCapture = (
  error: unknown,
  context: ReturnType<typeof buildPaymentCaptureContext>,
) => void;

/**
 * Minimal FinancialAlertService surface used by the failure-reporting helper. Pure
 * structural type — keeps the helper file decoupled from the Nest provider class.
 */
export type CheckoutPaymentFinancialAlert = {
  paymentFailed: (error: Error, context: ReturnType<typeof buildFinancialAlertContext>) => void;
};
