import type { Prisma } from '@prisma/client';

import type { BoletoChargeAddress } from '../payments/mercadopago/mercadopago.types';

/**
 * Pure helpers extracted from {@link SalesService} so they can be unit-tested
 * in isolation without instantiating the Nest module. No side effects, no
 * dependency on Prisma/Stripe/MP/audit/spine — only the inputs they receive.
 */

export const SALES_PROCESSOR = 'sales-service' as const;
export const SALES_PROCESSOR_VERSION = '1.0.0' as const;
export const SALES_SCHEMA_VERSION = '1.0.0' as const;

export const MP_WEBHOOK_PATH = '/webhooks/mercadopago' as const;

/** 30 minutes — standard MP PIX expiration window. */
export const PIX_EXPIRATION_MINUTES = 30;

/** 3 days — standard boleto settlement window exposed to chat receipts. */
export const BOLETO_EXPIRATION_DAYS = 3;

/** Standard Mercado Pago provenance block reused across spine emissions. */
export const SALES_PROVENANCE = {
  source: 'production' as const,
  processor: SALES_PROCESSOR,
  processorVersion: SALES_PROCESSOR_VERSION,
  schemaVersion: SALES_SCHEMA_VERSION,
};

/**
 * Resolve the backend public origin (with protocol) from env, falling back to
 * `http://localhost:3001` for local dev. Always trims trailing slashes and
 * forces an `https://` prefix if the raw value omits the scheme.
 */
export function resolveBackendOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw =
    env.BACKEND_PUBLIC_URL ||
    env.PUBLIC_BACKEND_URL ||
    env.BACKEND_URL ||
    env.API_PUBLIC_URL ||
    env.APP_URL ||
    'http://localhost:3001';
  const trimmed = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Resolve the frontend public origin (with protocol) from env, falling back to
 * `http://localhost:3000` for local dev. Same trimming/prefix rules as
 * {@link resolveBackendOrigin}.
 */
export function resolveFrontendOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw =
    env.FRONTEND_PUBLIC_URL ||
    env.PUBLIC_FRONTEND_URL ||
    env.FRONTEND_URL ||
    env.APP_URL ||
    'http://localhost:3000';
  const trimmed = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/** Build the canonical Mercado Pago notification URL for sales webhooks. */
export function buildMercadoPagoNotificationUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${resolveBackendOrigin(env)}${MP_WEBHOOK_PATH}`;
}

/** Compute a PIX expiration timestamp `PIX_EXPIRATION_MINUTES` from `now`. */
export function computePixExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + PIX_EXPIRATION_MINUTES * 60_000);
}

/** Compute a boleto expiration timestamp `BOLETO_EXPIRATION_DAYS` from `now`. */
export function computeBoletoExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + BOLETO_EXPIRATION_DAYS * 24 * 60 * 60_000);
}

/** Convert a BRL plan price (decimal) to bigint cents, rounded half-up. */
export function planPriceToCents(price: number): bigint {
  return BigInt(Math.round(price * 100));
}

/** Convert a BRL plan price (decimal) to a `number` of cents (Stripe API). */
export function planPriceToCentsNumber(price: number): number {
  return Math.round(price * 100);
}

/** Strip every non-digit character from a CPF/CNPJ value. */
export function sanitizeDocumentDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Compact metadata representation of a buyer address, dropping the optional
 * `neighborhood` field when absent so the JSON payload stays clean.
 */
export function buildBoletoAddressMetadata(address: BoletoChargeAddress): Record<string, string> {
  return {
    zipCode: address.zipCode,
    street: address.street,
    number: address.number,
    ...(address.neighborhood ? { neighborhood: address.neighborhood } : {}),
    city: address.city,
    state: address.state,
  };
}

/**
 * Build the Stripe Checkout success/cancel URL pair used by in-chat card
 * purchases. The frontend route `/vendas/gestao-vendas` listens for the
 * `stripe_checkout` query param and shows a confirmation state.
 */
export function buildStripeCheckoutUrls(
  frontendOrigin: string,
  saleId: string,
): { successUrl: string; cancelUrl: string } {
  const encodedSaleId = encodeURIComponent(saleId);
  return {
    successUrl: `${frontendOrigin}/vendas/gestao-vendas?stripe_checkout=success&saleId=${encodedSaleId}`,
    cancelUrl: `${frontendOrigin}/vendas/gestao-vendas?stripe_checkout=canceled&saleId=${encodedSaleId}`,
  };
}

/**
 * Pick the external payment id from a Stripe checkout session. Prefers the
 * expanded payment intent id, then falls back to the session id when the
 * intent is absent (e.g. test fixtures).
 */
export function pickStripeExternalPaymentId(
  paymentIntent: string | { id: string } | null | undefined,
  fallbackSessionId: string,
): string {
  if (typeof paymentIntent === 'string') {
    return paymentIntent;
  }
  return paymentIntent?.id || fallbackSessionId;
}

/** Format a human-readable description from the plan's product/plan names. */
export function buildSaleDescription(productName: string, planName: string): string {
  return productName || `Plano ${planName}`;
}

// ------- Metadata builders -------

export interface SaleBuyerMetadataInput {
  productId: string;
  planId: string;
  buyerName: string;
  buyerEmail: string;
}

/**
 * Build the baseline buyer metadata stored on every {@link KloelSale.create}.
 * Shared by PIX / boleto / card flows so the metadata shape stays consistent.
 */
export function buildSaleBuyerMetadata(input: SaleBuyerMetadataInput): Record<string, string> {
  return {
    productId: input.productId,
    planId: input.planId,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
  };
}

/**
 * Assemble the {@link SaleBuyerMetadataInput} shape from the raw catalog ids
 * and the buyer's name/email. Eliminates three near-identical literal object
 * scaffolds across {@link SalesService.createPixOrder} / `createBoletoOrder` /
 * `createStripeCardLink`.
 */
export function pickSaleBuyerMetadataInput(
  productId: string,
  planId: string,
  buyer: { name: string; email: string },
): SaleBuyerMetadataInput {
  return {
    productId,
    planId,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
  };
}

/**
 * Build the PIX-specific metadata applied to the sale row after the MP charge
 * succeeds (preserves the buyer block, layers in the external ids / status).
 */
export function buildPixSaleUpdateMetadata(
  buyer: SaleBuyerMetadataInput,
  pixExternalId: string,
  pixStatus: string,
): Record<string, string> {
  return {
    ...buildSaleBuyerMetadata(buyer),
    pixExternalId,
    pixStatus,
  };
}

/**
 * Build the boleto metadata stored when the sale row is created (buyer block
 * plus the compact address representation).
 */
export function buildBoletoSaleCreateMetadata(
  buyer: SaleBuyerMetadataInput,
  buyerAddressMetadata: Record<string, string>,
): Record<string, string | Record<string, string>> {
  return {
    ...buildSaleBuyerMetadata(buyer),
    buyerAddress: buyerAddressMetadata,
  };
}

export interface BoletoUpdateMetadataInput {
  buyer: SaleBuyerMetadataInput;
  buyerAddressMetadata: Record<string, string>;
  externalId: string;
  status: string;
  barcode: string;
}

/**
 * Build the boleto-specific metadata applied to the sale row after the MP
 * charge succeeds.
 */
export function buildBoletoSaleUpdateMetadata(
  input: BoletoUpdateMetadataInput,
): Record<string, string | Record<string, string>> {
  return {
    ...buildSaleBuyerMetadata(input.buyer),
    buyerAddress: input.buyerAddressMetadata,
    boletoExternalId: input.externalId,
    boletoStatus: input.status,
    boletoBarcode: input.barcode,
  };
}

/**
 * Build the Stripe-specific metadata applied to the sale row after the Stripe
 * checkout session is created.
 */
export function buildStripeSaleUpdateMetadata(
  buyer: SaleBuyerMetadataInput,
  stripeCheckoutSessionId: string,
  stripePaymentIntentId: string,
): Record<string, string> {
  return {
    ...buildSaleBuyerMetadata(buyer),
    stripeCheckoutSessionId,
    stripePaymentIntentId,
  };
}

export interface StripeSessionMetadataInput {
  workspaceId: string;
  saleId: string;
  productId: string;
  planId: string;
  productName: string;
  phone?: string;
}

/**
 * Build the metadata block attached to a Stripe Checkout Session. Includes
 * dual-naming (snake_case + camelCase) keys to remain compatible with both
 * KLOEL webhook handlers and Stripe dashboard inspection.
 */
export function buildStripeSessionMetadata(
  input: StripeSessionMetadataInput,
): Record<string, string> {
  return {
    workspace_id: input.workspaceId,
    workspaceId: input.workspaceId,
    kloel_order_id: input.saleId,
    orderId: input.saleId,
    saleId: input.saleId,
    productId: input.productId,
    planId: input.planId,
    productName: input.productName,
    payment_method: 'CREDIT_CARD',
    sourceCapability: 'sales.create_card_link',
    ...(input.phone ? { phone: input.phone } : {}),
  };
}

/**
 * Build the single-item Stripe Checkout `line_items` array used by in-chat
 * card sales. Keeps quantity, currency and `product_data` aligned across calls.
 */
export function buildStripeCheckoutLineItems(
  productName: string,
  amountCents: number,
): Array<{
  quantity: number;
  price_data: {
    currency: 'brl';
    unit_amount: number;
    product_data: { name: string };
  };
}> {
  return [
    {
      quantity: 1,
      price_data: {
        currency: 'brl',
        unit_amount: amountCents,
        product_data: { name: productName },
      },
    },
  ];
}

/**
 * Build the metadata attached to the Stripe PaymentIntent (subset of the
 * session metadata — excludes catalog identifiers / phone).
 */
export function buildStripePaymentIntentMetadata(
  workspaceId: string,
  saleId: string,
): Record<string, string> {
  return {
    workspace_id: workspaceId,
    workspaceId,
    kloel_order_id: saleId,
    orderId: saleId,
    saleId,
    payment_method: 'CREDIT_CARD',
    sourceCapability: 'sales.create_card_link',
  };
}

// ------- Spine envelope builder -------

export type SalesPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export interface SpineSaleEnvelopeInput {
  eventName: string;
  workspaceId: string;
  saleId: string;
  payload: Record<string, unknown>;
}

/**
 * Build the canonical spine envelope (with KLOEL provenance + standard entity
 * ref) used by every {@link SalesService} emission. Keeps each call site to a
 * single helper invocation instead of the same 8-line scaffold.
 */
export function buildSpineSaleEnvelope(input: SpineSaleEnvelopeInput): {
  eventName: string;
  workspaceId: string;
  entityRef: { entityType: 'sale'; entityId: string };
  truthMode: 'observed';
  provenance: typeof SALES_PROVENANCE;
  payload: Record<string, unknown>;
} {
  return {
    eventName: input.eventName,
    workspaceId: input.workspaceId,
    entityRef: { entityType: 'sale', entityId: input.saleId },
    truthMode: 'observed',
    provenance: SALES_PROVENANCE,
    payload: input.payload,
  };
}

export interface SaleCreatedPayloadInput {
  saleId: string;
  productId: string;
  planId: string;
  amount: number;
  paymentMethod: SalesPaymentMethod;
  externalPaymentId: string;
  checkoutSessionId?: string;
}

/** Build the `sale.created` spine payload. */
export function buildSaleCreatedPayload(input: SaleCreatedPayloadInput): Record<string, unknown> {
  return {
    saleId: input.saleId,
    productId: input.productId,
    planId: input.planId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    externalPaymentId: input.externalPaymentId,
    ...(input.checkoutSessionId ? { checkoutSessionId: input.checkoutSessionId } : {}),
  };
}

export interface PaymentPendingPayloadInput {
  saleId: string;
  externalPaymentId: string;
  gateway: 'mercadopago' | 'stripe';
  method: SalesPaymentMethod;
  amount: number;
  status?: string;
  checkoutSessionId?: string;
}

/** Build the `payment.pending` spine payload. */
export function buildPaymentPendingPayload(
  input: PaymentPendingPayloadInput,
): Record<string, unknown> {
  return {
    saleId: input.saleId,
    externalPaymentId: input.externalPaymentId,
    gateway: input.gateway,
    method: input.method,
    amount: input.amount,
    status: input.status ?? 'pending',
    ...(input.checkoutSessionId ? { checkoutSessionId: input.checkoutSessionId } : {}),
  };
}

/**
 * Unified input for the `sale.created` + `payment.pending` event pair every
 * `createXxxOrder` flow emits after the persistence transaction commits.
 */
export interface SaleEventPairInput {
  saleId: string;
  productId: string;
  planId: string;
  amount: number;
  paymentMethod: SalesPaymentMethod;
  externalPaymentId: string;
  gateway: 'mercadopago' | 'stripe';
  checkoutSessionId?: string;
}

/**
 * Build the `(sale.created, payment.pending)` payload pair used by PIX, boleto
 * and Stripe card flows. Collapses the triple-duplicated post-transaction emit
 * block in `SalesService` into a single pure call site per method.
 */
export function buildSaleEventPair(input: SaleEventPairInput): {
  saleCreated: Record<string, unknown>;
  paymentPending: Record<string, unknown>;
} {
  const saleCreated = buildSaleCreatedPayload({
    saleId: input.saleId,
    productId: input.productId,
    planId: input.planId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    externalPaymentId: input.externalPaymentId,
    ...(input.checkoutSessionId ? { checkoutSessionId: input.checkoutSessionId } : {}),
  });
  const paymentPending = buildPaymentPendingPayload({
    saleId: input.saleId,
    externalPaymentId: input.externalPaymentId,
    gateway: input.gateway,
    method: input.paymentMethod,
    amount: input.amount,
    ...(input.checkoutSessionId ? { checkoutSessionId: input.checkoutSessionId } : {}),
  });
  return { saleCreated, paymentPending };
}

/**
 * Input for the in-transaction `PAYMENT_PENDING` audit row written right after
 * the external payment provider returns. Mirrors the audit `details` object
 * each `createXxxOrder` flow constructs inline.
 */
export interface PaymentPendingAuditDetailsInput {
  externalPaymentId: string;
  gateway: 'mercadopago' | 'stripe';
  method: SalesPaymentMethod;
  amount: number;
  status?: string;
}

/**
 * Build the `PAYMENT_PENDING` audit `details` envelope. Defaults `status` to
 * `'pending'` so callers don't have to remember the literal for Stripe checkout
 * sessions (where the provider does not echo a status on session.create).
 */
export function buildPaymentPendingAuditDetails(
  input: PaymentPendingAuditDetailsInput,
): Record<string, unknown> {
  return {
    externalPaymentId: input.externalPaymentId,
    gateway: input.gateway,
    method: input.method,
    amount: input.amount,
    status: input.status ?? 'pending',
  };
}

// ------- Audit detail builders -------

export interface SaleCreatedAuditDetailsInput {
  productId: string;
  planId: string;
  amount: number;
  paymentMethod: SalesPaymentMethod;
}

/**
 * Build the `SALE_CREATED` audit `details` envelope. Every `createXxxOrder`
 * flow writes an identical-shaped audit row right after the sale record is
 * created, differing only in `paymentMethod`.
 */
export function buildSaleCreatedAuditDetails(
  input: SaleCreatedAuditDetailsInput,
): Record<string, unknown> {
  return {
    productId: input.productId,
    planId: input.planId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
  };
}

// ------- Log message builders -------

export interface SaleSuccessLogInput {
  method: string;
  saleId: string;
  externalPaymentId: string;
  workspaceId: string;
}

/**
 * Build the success log message emitted after a sale is created and the
 * external payment provider has returned. Keeps the message shape consistent
 * across PIX, boleto and Stripe card flows.
 */
export function buildSaleSuccessLogMessage(input: SaleSuccessLogInput): string {
  return `${input.method} created: saleId=${input.saleId} externalPaymentId=${input.externalPaymentId} workspace=${input.workspaceId}`;
}

// ------- KloelSale.create data builders -------

export interface KloelSaleCreateDataInput {
  workspaceId: string;
  productName: string;
  amount: number;
  paymentMethod: SalesPaymentMethod;
  leadPhone: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Build the `data` argument for `prisma.kloelSale.create({ data })`. Used by
 * PIX, boleto and Stripe card flows — collapses the triple-duplicated literal
 * scaffold (workspaceId / productName / amount / status / paymentMethod /
 * leadPhone / metadata) into a single helper call. Returns the Prisma
 * `Unchecked` variant directly so callers pass the result through
 * `kloelSale.create({ data })` without further casts. `status` is always
 * `'pending'` at this stage — confirmation flows flip the row to its final
 * state via a separate update path.
 */
export function buildKloelSaleCreateData(
  input: KloelSaleCreateDataInput,
): Prisma.KloelSaleUncheckedCreateInput {
  return {
    workspaceId: input.workspaceId,
    productName: input.productName,
    amount: input.amount,
    status: 'pending',
    paymentMethod: input.paymentMethod,
    leadPhone: input.leadPhone,
    metadata: input.metadata as Prisma.InputJsonValue,
  };
}

// ------- Stripe Checkout session input builder -------

/**
 * Structural shape of the `checkout.sessions.create` first positional arg used
 * by {@link SalesService.createStripeCardLink}. Kept structural to avoid a
 * direct dependency on the Stripe SDK type from this pure helpers module —
 * the service still passes the result to a fully-typed Stripe client method,
 * so TS catches drift at the call site.
 */
export interface StripeCheckoutSessionInput {
  mode: 'payment';
  payment_method_types: ['card'];
  customer_email: string;
  line_items: ReturnType<typeof buildStripeCheckoutLineItems>;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  payment_intent_data: { metadata: Record<string, string> };
}

export interface BuildStripeCheckoutSessionInputArgs {
  workspaceId: string;
  saleId: string;
  productId: string;
  planId: string;
  productName: string;
  buyerEmail: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  phone?: string;
}

/**
 * Assemble the full `checkout.sessions.create` first arg from the per-call
 * primitives. Composes {@link buildStripeCheckoutLineItems},
 * {@link buildStripeSessionMetadata} and
 * {@link buildStripePaymentIntentMetadata} so the service body stops carrying
 * a 22-line literal object.
 */
export function buildStripeCheckoutSessionInput(
  args: BuildStripeCheckoutSessionInputArgs,
): StripeCheckoutSessionInput {
  return {
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: args.buyerEmail,
    line_items: buildStripeCheckoutLineItems(args.productName, args.amountCents),
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: buildStripeSessionMetadata({
      workspaceId: args.workspaceId,
      saleId: args.saleId,
      productId: args.productId,
      planId: args.planId,
      productName: args.productName,
      ...(args.phone ? { phone: args.phone } : {}),
    }),
    payment_intent_data: {
      metadata: buildStripePaymentIntentMetadata(args.workspaceId, args.saleId),
    },
  };
}

// ------- Result-shape builders (in-chat order responses) -------

export interface PixOrderResultInput {
  saleId: string;
  expiresAt: Date;
  pixResult: {
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl: string;
    externalId: string;
  };
}

/**
 * Build the {@link CreatePixOrderResult} the chat surface receives. Prefers
 * the raw `qrCode` (copia-e-cola string) for `pixQrCode` and falls back to the
 * base64 PNG when the copia-e-cola is empty — matches the historical
 * {@link SalesService.createPixOrder} return shape exactly.
 */
export function buildPixOrderResult(input: PixOrderResultInput): {
  saleId: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  pixCopyPaste: string;
  pixExpiresAt: Date;
  externalPaymentId: string;
  ticketUrl: string;
} {
  const { pixResult } = input;
  return {
    saleId: input.saleId,
    pixQrCode: pixResult.qrCode || pixResult.qrCodeBase64,
    pixQrCodeBase64: pixResult.qrCodeBase64,
    pixCopyPaste: pixResult.qrCode,
    pixExpiresAt: input.expiresAt,
    externalPaymentId: pixResult.externalId,
    ticketUrl: pixResult.ticketUrl,
  };
}

export interface BoletoOrderResultInput {
  saleId: string;
  boletoResult: {
    digitableLine: string;
    barcodeContent: string;
    expiresAt: Date;
    ticketUrl: string;
    externalId: string;
  };
}

/**
 * Build the {@link CreateBoletoOrderResult} the chat surface receives. Prefers
 * the human-readable digitable line for `boletoBarcode`, falling back to the
 * raw barcode content when MP returns an empty digitable line.
 */
export function buildBoletoOrderResult(input: BoletoOrderResultInput): {
  saleId: string;
  boletoBarcode: string;
  boletoExpiresAt: Date;
  boletoUrl: string;
  externalPaymentId: string;
} {
  const { boletoResult } = input;
  return {
    saleId: input.saleId,
    boletoBarcode: boletoResult.digitableLine || boletoResult.barcodeContent,
    boletoExpiresAt: boletoResult.expiresAt,
    boletoUrl: boletoResult.ticketUrl,
    externalPaymentId: boletoResult.externalId,
  };
}

export interface StripeCardLinkResultInput {
  saleId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  externalPaymentId: string;
}

/**
 * Build the {@link CreateStripeCardLinkResult} returned to the chat surface.
 * Pure passthrough — the helper exists to keep the three result-builder
 * functions symmetric and to give the spec suite a single import surface for
 * exercising the shape.
 */
export function buildStripeCardLinkResult(input: StripeCardLinkResultInput): {
  saleId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  externalPaymentId: string;
} {
  return {
    saleId: input.saleId,
    checkoutSessionId: input.checkoutSessionId,
    checkoutUrl: input.checkoutUrl,
    externalPaymentId: input.externalPaymentId,
  };
}
