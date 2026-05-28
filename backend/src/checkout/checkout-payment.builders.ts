import { Prisma } from '@prisma/client';

import type { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import type { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type { StripeChargeService } from '../payments/stripe/stripe-charge.service';

import {
  buildPaymentDescription,
  normalizeBoletoAddress,
  toJsonValue,
} from './checkout-payment.mappers';
import {
  type BoletoDisplayData,
  type CheckoutPaymentMethod,
  type CheckoutPaymentStatus,
  type PixDisplayData,
  STRIPE_THREE_DS_REQUEST_ANY,
} from './checkout-payment.types';

/**
 * Pure input/output envelope builders for checkout payment arms. Split out from
 * `checkout-payment.helpers.ts` (Wave 83). Every export below is re-exported by
 * `checkout-payment.helpers.ts`. No money arithmetic — all amount inputs are
 * forwarded verbatim into Stripe / Mercado Pago / Prisma payloads. No I/O.
 */

type SaleChargeInput = Parameters<StripeChargeService['createSaleCharge']>[0];
type StripeSaleCharge = Awaited<ReturnType<StripeChargeService['createSaleCharge']>>;
type CardPaymentOptions = Extract<
  NonNullable<NonNullable<SaleChargeInput['paymentMethodOptions']>['card']>,
  object
>;

type MercadoPagoBoletoCharge = Awaited<ReturnType<MercadoPagoBoletoChargeService['create']>>;
type MercadoPagoPixCharge = Awaited<ReturnType<MercadoPagoPixChargeService['create']>>;
type MercadoPagoPixCreateInput = Parameters<MercadoPagoPixChargeService['create']>[0];
type MercadoPagoBoletoCreateInput = Parameters<MercadoPagoBoletoChargeService['create']>[0];

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
 * Build the `StripeChargeService.createSaleCharge` input envelope for a checkout
 * payment. Pure builder — copies caller-supplied amount fields verbatim into
 * `bigint`, attaches the optional 3DS request flag, and assembles the metadata
 * tag. No money arithmetic and no I/O; the inputs already arrived as exact
 * integer cents.
 */
export function buildStripeChargeInput(
  params: {
    orderId: string;
    idempotencyKey?: string;
    workspaceId: string;
    customerEmail: string;
  },
  opts: {
    sellerStripeAccountId: string;
    currency: string;
    baseTotalInCents: number;
    chargedTotalInCents: number;
    marketplaceFeeInCents: number;
    interestInCents: number;
    forceThreeDS?: boolean;
  },
): SaleChargeInput {
  const threeDsRequest = STRIPE_THREE_DS_REQUEST_ANY as NonNullable<
    CardPaymentOptions['request_three_d_secure']
  >;
  const paymentMethodOptions: SaleChargeInput['paymentMethodOptions'] | undefined =
    opts.forceThreeDS
      ? {
          card: {
            request_three_d_secure: threeDsRequest,
          },
        }
      : undefined;

  const base: SaleChargeInput = {
    workspaceId: params.workspaceId,
    sellerStripeAccountId: opts.sellerStripeAccountId,
    buyerPaidCents: BigInt(opts.chargedTotalInCents),
    saleValueCents: BigInt(opts.baseTotalInCents),
    interestCents: BigInt(opts.interestInCents),
    marketplaceFeeCents: BigInt(opts.marketplaceFeeInCents),
    currency: opts.currency,
    idempotencyKey: params.idempotencyKey || params.orderId,
    buyerEmail: params.customerEmail,
    paymentMethodTypes: ['card'],
    metadata: {
      kloel_order_id: params.orderId,
      workspace_id: params.workspaceId,
    },
  };
  if (paymentMethodOptions !== undefined) {
    base.paymentMethodOptions = paymentMethodOptions;
  }
  return base;
}

/**
 * Build the `Prisma.CheckoutPaymentUncheckedCreateInput` envelope persisted for
 * a Stripe (card) charge. Pure formatter — webhookData is serialized via
 * `toJsonValue`; no money math (provider-supplied amounts already settled).
 */
export function buildStripePaymentData(input: {
  orderId: string;
  cardLast4: string | null;
  status: CheckoutPaymentStatus;
  pixData: PixDisplayData;
  charge: StripeSaleCharge;
}): Prisma.CheckoutPaymentUncheckedCreateInput {
  return {
    orderId: input.orderId,
    gateway: 'stripe',
    externalId: input.charge.paymentIntentId,
    pixQrCode: input.pixData.pixQrCode,
    pixCopyPaste: input.pixData.pixCopyPaste,
    pixExpiresAt: input.pixData.pixExpiresAt ? new Date(input.pixData.pixExpiresAt) : null,
    boletoUrl: null,
    boletoBarcode: null,
    boletoExpiresAt: null,
    cardLast4: input.cardLast4,
    cardBrand: null,
    status: input.status,
    webhookData: toJsonValue({
      provider: 'stripe',
      paymentIntent: input.charge.stripePaymentIntent,
      split: input.charge.split,
      splitInput: input.charge.splitInput,
    }),
  };
}

/**
 * Build the `Prisma.CheckoutPaymentUncheckedCreateInput` envelope persisted for
 * a Mercado Pago PIX charge. Pure formatter — no money math.
 */
export function buildMercadoPagoPixPaymentData(input: {
  orderId: string;
  status: CheckoutPaymentStatus;
  pixData: PixDisplayData;
  charge: MercadoPagoPixCharge;
}): Prisma.CheckoutPaymentUncheckedCreateInput {
  return {
    orderId: input.orderId,
    gateway: 'mercadopago',
    externalId: input.charge.externalId,
    pixQrCode: input.pixData.pixQrCode,
    pixCopyPaste: input.pixData.pixCopyPaste,
    pixExpiresAt: input.pixData.pixExpiresAt ? new Date(input.pixData.pixExpiresAt) : null,
    boletoUrl: null,
    boletoBarcode: null,
    boletoExpiresAt: null,
    cardLast4: null,
    cardBrand: null,
    status: input.status,
    webhookData: toJsonValue({
      provider: 'mercadopago',
      paymentMethod: 'pix',
      payment: input.charge.raw,
    }),
  };
}

/**
 * Build the `Prisma.CheckoutPaymentUncheckedCreateInput` envelope persisted for
 * a Mercado Pago boleto charge. Pure formatter — no money math.
 */
export function buildMercadoPagoBoletoPaymentData(input: {
  orderId: string;
  status: CheckoutPaymentStatus;
  charge: MercadoPagoBoletoCharge;
}): Prisma.CheckoutPaymentUncheckedCreateInput {
  return {
    orderId: input.orderId,
    gateway: 'mercadopago',
    externalId: input.charge.externalId,
    pixQrCode: null,
    pixCopyPaste: null,
    pixExpiresAt: null,
    boletoUrl: input.charge.ticketUrl,
    boletoBarcode: input.charge.digitableLine || input.charge.barcodeContent,
    boletoExpiresAt: input.charge.expiresAt,
    cardLast4: null,
    cardBrand: null,
    status: input.status,
    webhookData: toJsonValue({
      provider: 'mercadopago',
      paymentMethod: 'boleto',
      payment: input.charge.raw,
    }),
  };
}

/**
 * Build the Mercado Pago PIX charge input envelope. Pure builder — copies caller
 * money values verbatim into `bigint` and assembles the description/notification
 * URL. No money arithmetic and no I/O. The `payerDocument` field is omitted when
 * the caller has no document (mirrors prior conditional spread behavior).
 */
export function buildMercadoPagoPixChargeInput(input: {
  idempotencyKey: string;
  chargedTotalInCents: number;
  payerEmail: string;
  payerName: string;
  payerDocument?: string;
  productName: string | undefined;
  orderId: string;
  expiresAt: Date;
  notificationUrl: string;
}): MercadoPagoPixCreateInput {
  const base: MercadoPagoPixCreateInput = {
    idempotencyKey: input.idempotencyKey,
    amountCents: BigInt(input.chargedTotalInCents),
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    description: buildPaymentDescription(input.productName, input.orderId),
    externalReference: input.orderId,
    expiresAt: input.expiresAt,
    notificationUrl: input.notificationUrl,
  };
  return input.payerDocument !== undefined ? { ...base, payerDocument: input.payerDocument } : base;
}

/**
 * Build the Mercado Pago boleto charge input envelope. Pure builder — copies caller
 * money values verbatim into `bigint`, assembles the description, and forwards the
 * payer address verbatim. No money arithmetic and no I/O.
 */
export function buildMercadoPagoBoletoChargeInput(input: {
  idempotencyKey: string;
  chargedTotalInCents: number;
  payerEmail: string;
  payerName: string;
  payerDocument: string;
  payerAddress: NonNullable<ReturnType<typeof normalizeBoletoAddress>>;
  productName: string | undefined;
  orderId: string;
  expiresAt: Date;
  notificationUrl: string;
}): MercadoPagoBoletoCreateInput {
  return {
    idempotencyKey: input.idempotencyKey,
    amountCents: BigInt(input.chargedTotalInCents),
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    payerDocument: input.payerDocument,
    payerAddress: input.payerAddress,
    description: buildPaymentDescription(input.productName, input.orderId),
    externalReference: input.orderId,
    expiresAt: input.expiresAt,
    notificationUrl: input.notificationUrl,
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
