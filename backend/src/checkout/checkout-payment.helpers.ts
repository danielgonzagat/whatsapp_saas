import { Prisma } from '@prisma/client';

import type { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import type { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type {
  PaymentMethod,
  ProviderRoutingDecision,
} from '../payments/provider-router/provider-router.types';

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
