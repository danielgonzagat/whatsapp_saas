import { Prisma } from '@prisma/client';

import type { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import type { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type {
  PaymentMethod,
  ProviderRoutingDecision,
} from '../payments/provider-router/provider-router.types';
import type { StripeChargeService } from '../payments/stripe/stripe-charge.service';

type SaleChargeInput = Parameters<StripeChargeService['createSaleCharge']>[0];
type StripeSaleCharge = Awaited<ReturnType<StripeChargeService['createSaleCharge']>>;
type CardPaymentOptions = Extract<
  NonNullable<NonNullable<SaleChargeInput['paymentMethodOptions']>['card']>,
  object
>;

/** Checkout-facing payment method discriminator (UI vocabulary). */
export type CheckoutPaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

/** Mercado Pago webhook callback path appended to the backend public origin. */
export const MP_WEBHOOK_PATH = '/webhooks/mercadopago';
/** Boleto expiration window enforced when emitting Mercado Pago boleto charges. */
export const BOLETO_EXPIRATION_DAYS = 3;
/** Pix expiration window enforced when emitting Mercado Pago Pix charges. */
export const PIX_EXPIRATION_MINUTES = 30;

type MercadoPagoBoletoCharge = Awaited<ReturnType<MercadoPagoBoletoChargeService['create']>>;
type MercadoPagoPixCharge = Awaited<ReturnType<MercadoPagoPixChargeService['create']>>;
type MercadoPagoBoletoAddress = Parameters<
  MercadoPagoBoletoChargeService['create']
>[0]['payerAddress'];

/** Payment status discriminated union used by checkout payment flows. */
export type CheckoutPaymentStatus = 'APPROVED' | 'DECLINED' | 'PENDING' | 'PROCESSING' | 'CANCELED';

/** PIX display payload persisted from Mercado Pago checkout charges. */
export type PixDisplayData = {
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
};

/** Map a Stripe PaymentIntent status string to the checkout payment status. */
export function mapStripePaymentStatus(status?: string | null): CheckoutPaymentStatus {
  switch (String(status || '').toLowerCase()) {
    case 'succeeded':
      return 'APPROVED';
    case 'processing':
      return 'PROCESSING';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}

/** Serialize a value to Prisma InputJsonValue, converting BigInt to string. */
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, currentValue) =>
      typeof currentValue === 'bigint' ? currentValue.toString() : currentValue,
    ),
  ) as Prisma.InputJsonValue;
}

/** Resolve the backend public origin used to build webhook callback URLs. */
export function resolveBackendOrigin(): string {
  const raw =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.APP_URL ||
    'http://localhost:3001';
  const trimmed = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/** Map a Mercado Pago charge status to the canonical checkout payment status. */
export function mapMercadoPagoPaymentStatus(
  status: MercadoPagoBoletoCharge['status'] | MercadoPagoPixCharge['status'],
): CheckoutPaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
    case 'expired':
    case 'refunded':
      return 'CANCELED';
    case 'in_process':
      return 'PROCESSING';
    case 'pending':
    default:
      return 'PENDING';
  }
}

/**
 * Format a Mercado Pago base64 QR image into a data URL renderable by the frontend.
 * Returns null when the input is empty; passes through inputs that already use the data URL scheme.
 */
export function formatMercadoPagoQrImage(qrCodeBase64: string): string | null {
  if (!qrCodeBase64) {
    return null;
  }
  if (/^data:image\//i.test(qrCodeBase64)) {
    return qrCodeBase64;
  }
  return `data:image/png;base64,${qrCodeBase64}`;
}

/** Read the first non-empty string-like value from a known address key set. */
export function readBoletoAddressField(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return String(raw);
    }
  }
  return '';
}

/**
 * Normalize a free-form address object into the Mercado Pago boleto payer payload.
 * Returns null when any required field (zip, street, number, city, state) is missing.
 */
export function normalizeBoletoAddress(value: unknown): MercadoPagoBoletoAddress | null {
  const zipCode = readBoletoAddressField(value, ['cep', 'zipCode', 'zip', 'postalCode']).replace(
    /\D/g,
    '',
  );
  const street = readBoletoAddressField(value, ['street', 'streetName', 'rua', 'logradouro']);
  const number = readBoletoAddressField(value, ['number', 'streetNumber', 'numero']);
  const neighborhood = readBoletoAddressField(value, ['neighborhood', 'bairro']);
  const city = readBoletoAddressField(value, ['city', 'cidade']);
  const state = readBoletoAddressField(value, ['state', 'uf', 'federalUnit'])
    .replace(/[^a-z]/gi, '')
    .toUpperCase();

  if (!zipCode || !street || !number || !city || !state) {
    return null;
  }

  return {
    zipCode,
    street,
    number,
    ...(neighborhood ? { neighborhood } : {}),
    city,
    state,
  };
}

/**
 * Map a checkout-facing payment method ('CREDIT_CARD' | 'PIX' | 'BOLETO') to the
 * provider-router vocabulary ('card' | 'pix' | 'boleto'). Pure mapping — no money
 * arithmetic and no I/O.
 */
export function toProviderPaymentMethod(method: CheckoutPaymentMethod): PaymentMethod {
  switch (method) {
    case 'PIX':
      return 'pix';
    case 'BOLETO':
      return 'boleto';
    case 'CREDIT_CARD':
      return 'card';
    default: {
      const exhaustive: never = method;
      throw new Error(`unknown_checkout_payment_method:${String(exhaustive)}`);
    }
  }
}

/**
 * Pure type guard: asserts that the provider router resolved to the expected canonical
 * provider for the given checkout payment method. Throws a deterministic error whose
 * shape (`payment_provider_route_mismatch:<METHOD>:expected_<X>:got_<Y>`) is part of
 * the contract observed by checkout payment specs.
 */
export function assertCanonicalProvider(
  decision: ProviderRoutingDecision,
  expectedProvider: ProviderRoutingDecision['provider'],
  method: CheckoutPaymentMethod,
): void {
  if (decision.provider !== expectedProvider) {
    throw new Error(
      `payment_provider_route_mismatch:${method}:expected_${expectedProvider}:got_${decision.provider}`,
    );
  }
}

/**
 * Fraud-decision → audit-action mapping. The 'allow' action has no audit log entry,
 * so it is intentionally absent. Pure constant: no money arithmetic, no I/O.
 */
export const FRAUD_ACTION_AUDIT_MAP = {
  block: 'CHECKOUT_PAYMENT_BLOCKED_BY_FRAUD',
  review: 'CHECKOUT_PAYMENT_REVIEW_REQUIRED',
  require_3ds: 'CHECKOUT_PAYMENT_3DS_REQUIRED',
} as const;

/** Discriminator for a fraud-engine action that warrants an audit-log entry. */
export type AuditableFraudAction = keyof typeof FRAUD_ACTION_AUDIT_MAP;

/**
 * Build a human-readable payment description from an optional product name, falling
 * back to a deterministic `Pedido <orderId>` string. Pure formatter — no money math.
 */
export function buildPaymentDescription(productName: string | undefined, orderId: string): string {
  const trimmed = productName?.trim();
  return trimmed ? trimmed : `Pedido ${orderId}`;
}

/** Stripe `request_three_d_secure` enum value extracted as a constant to avoid inline string assembly. */
export const STRIPE_THREE_DS_REQUEST_ANY = 'any' as const;

/**
 * Extracted checkout order monetary + fraud signal context. Pure read-through of the
 * order's free-form metadata blob: all amount fields are exact integers in cents and
 * are NOT mutated, scaled, or rounded here — the money path is preserved.
 */
export type CheckoutOrderMetadataView = {
  baseTotalInCents: number;
  chargedTotalInCents: number;
  marketplaceFeeInCents: number;
  interestInCents: number;
  deviceFingerprint: string | null;
  cardBin: string | null;
  cardCountry: string | null;
  orderCountry: string;
};

/**
 * Parse the JSON metadata blob attached to a checkout order into a typed view. Falls
 * back to deterministic defaults when fields are missing or shaped incorrectly. Pure
 * function — no money arithmetic, no I/O. The amount fields are read verbatim via
 * `Number(...)` exactly as the service did inline, preserving any prior coercion
 * semantics. `requestedTotalInCents` is the request-supplied total used as the final
 * fallback for chargedTotalInCents.
 */
export function extractOrderMetadataView(
  rawMetadata: unknown,
  orderTotalInCents: unknown,
  requestedTotalInCents: unknown,
): CheckoutOrderMetadataView {
  const metadata: Record<string, unknown> =
    rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? (rawMetadata as Record<string, unknown>)
      : {};

  const baseTotalInCents = Number(metadata.baseTotalInCents || orderTotalInCents || 0);
  const chargedTotalInCents = Number(
    metadata.chargedTotalInCents || baseTotalInCents || requestedTotalInCents || 0,
  );
  const marketplaceFeeInCents = Number(metadata.marketplaceFeeInCents || 0);
  const interestInCents = Number(metadata.installmentInterestInCents || 0);

  const deviceFingerprint =
    typeof metadata.deviceFingerprint === 'string' ? metadata.deviceFingerprint : null;
  const cardBin = typeof metadata.cardBin === 'string' ? metadata.cardBin : null;
  const cardCountry = typeof metadata.cardCountry === 'string' ? metadata.cardCountry : null;
  const orderCountry = typeof metadata.orderCountry === 'string' ? metadata.orderCountry : 'BR';

  return {
    baseTotalInCents,
    chargedTotalInCents,
    marketplaceFeeInCents,
    interestInCents,
    deviceFingerprint,
    cardBin,
    cardCountry,
    orderCountry,
  };
}

/**
 * Extract a trimmed product name from a checkout order's plan, falling back to
 * `undefined` when missing or empty. Pure read-through.
 */
export function extractProductName(
  plan: { product?: { name?: unknown } | null } | null,
): string | undefined {
  const name = plan?.product?.name;
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Deterministic empty PIX display payload, used by the Stripe (card) flow that does
 * not emit any PIX artifacts. Frozen to prevent accidental mutation by callers.
 */
export const EMPTY_PIX_DATA: PixDisplayData = Object.freeze({
  pixQrCode: null,
  pixCopyPaste: null,
  pixExpiresAt: null,
});

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

/** Extract a deterministic error message from an unknown thrown value. Pure. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Boleto display payload returned alongside Mercado Pago boleto charges. */
export type BoletoDisplayData = {
  boletoUrl: string | null;
  boletoBarcode: string | null;
  boletoExpiresAt: string | null;
};

/** Deterministic empty boleto display payload used by non-boleto flows. */
export const EMPTY_BOLETO_DATA: BoletoDisplayData = Object.freeze({
  boletoUrl: null,
  boletoBarcode: null,
  boletoExpiresAt: null,
});

/**
 * Build the PIX display payload persisted/returned for a Mercado Pago PIX charge.
 * Pure formatter — wraps the QR base64 into a renderable data URL, normalizes the
 * copy-paste value to nullable, and serializes the expiration timestamp to ISO.
 */
export function buildMercadoPagoPixDisplay(charge: {
  qrCodeBase64: string;
  qrCode?: string | null;
  expiresAt: Date;
}): PixDisplayData {
  return {
    pixQrCode: formatMercadoPagoQrImage(charge.qrCodeBase64),
    pixCopyPaste: charge.qrCode || null,
    pixExpiresAt: charge.expiresAt.toISOString(),
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
 * Build the boleto display payload persisted/returned for a Mercado Pago boleto
 * charge. Pure formatter — picks the digitable line when present and falls back to
 * the raw barcode content, serializes the expiration timestamp to ISO.
 */
export function buildMercadoPagoBoletoDisplay(charge: {
  ticketUrl: string;
  digitableLine?: string | null;
  barcodeContent: string;
  expiresAt: Date;
}): BoletoDisplayData {
  return {
    boletoUrl: charge.ticketUrl,
    boletoBarcode: charge.digitableLine || charge.barcodeContent,
    boletoExpiresAt: charge.expiresAt.toISOString(),
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
 * Minimal structural type of the checkout event emitter consumed by the lifecycle
 * helpers below. Mirrors only the surface the helpers touch so callers may pass any
 * compatible emitter (real or mock) without importing the concrete class.
 */
export type CheckoutLifecycleEmitter = {
  paymentInitiated(payload: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    paymentMethod: CheckoutPaymentMethod;
    amountInCents: number;
    correlationId?: string | undefined;
  }): unknown;
  paymentApproved(payload: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    amountInCents: number;
    correlationId?: string | undefined;
  }): unknown;
  paymentDeclined(payload: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string | undefined;
    correlationId?: string | undefined;
    reason: string;
  }): unknown;
};

/**
 * Fire the `paymentInitiated` lifecycle event and, when approved, the `paymentApproved`
 * event on the optional emitter. Both calls are fire-and-forget — failures are not
 * awaited and do not affect the caller. Pure orchestration, no money math.
 */
export function emitPaymentLifecycleEvents(
  emitter: CheckoutLifecycleEmitter | undefined,
  input: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    paymentMethod: CheckoutPaymentMethod;
    amountInCents: number;
    correlationId?: string | undefined;
    approved: boolean;
  },
): void {
  void emitter?.paymentInitiated({
    workspaceId: input.workspaceId,
    orderId: input.orderId,
    paymentIntentId: input.paymentIntentId,
    paymentMethod: input.paymentMethod,
    amountInCents: input.amountInCents,
    correlationId: input.correlationId,
  });
  if (input.approved) {
    void emitter?.paymentApproved({
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      paymentIntentId: input.paymentIntentId,
      amountInCents: input.amountInCents,
      correlationId: input.correlationId,
    });
  }
}

/**
 * Fire the `paymentDeclined` lifecycle event when a provider charge throws. The
 * declined event always carries `paymentIntentId: undefined` because the intent was
 * not created. Fire-and-forget. Pure.
 */
export function emitPaymentDeclined(
  emitter: CheckoutLifecycleEmitter | undefined,
  input: {
    workspaceId: string;
    orderId: string;
    correlationId?: string | undefined;
    error: unknown;
  },
): void {
  void emitter?.paymentDeclined({
    workspaceId: input.workspaceId,
    orderId: input.orderId,
    paymentIntentId: undefined,
    correlationId: input.correlationId,
    reason: describeError(input.error),
  });
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
