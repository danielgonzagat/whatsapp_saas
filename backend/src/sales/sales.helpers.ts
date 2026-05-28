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
