import { Prisma } from '@prisma/client';

import type { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import type { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type {
  PaymentMethod,
  ProviderRoutingDecision,
} from '../payments/provider-router/provider-router.types';

import type {
  BoletoDisplayData,
  CheckoutOrderMetadataView,
  CheckoutPaymentMethod,
  CheckoutPaymentStatus,
  PixDisplayData,
} from './checkout-payment.types';

/**
 * Pure formatters, normalizers, and value mappers used by the checkout payment
 * helpers. Split out from `checkout-payment.helpers.ts` (Wave 83). Every export
 * below is also re-exported from `checkout-payment.helpers.ts` to preserve the
 * public surface. No money arithmetic — amount fields are read or echoed
 * verbatim.
 */

type MercadoPagoBoletoCharge = Awaited<ReturnType<MercadoPagoBoletoChargeService['create']>>;
type MercadoPagoPixCharge = Awaited<ReturnType<MercadoPagoPixChargeService['create']>>;
type MercadoPagoBoletoAddress = Parameters<
  MercadoPagoBoletoChargeService['create']
>[0]['payerAddress'];

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
 * Build a human-readable payment description from an optional product name, falling
 * back to a deterministic `Pedido <orderId>` string. Pure formatter — no money math.
 */
export function buildPaymentDescription(productName: string | undefined, orderId: string): string {
  const trimmed = productName?.trim();
  return trimmed ? trimmed : `Pedido ${orderId}`;
}

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

/** Extract a deterministic error message from an unknown thrown value. Pure. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Re-export the provider routing decision type so callers that previously
// imported it transitively through `checkout-payment.helpers.ts` keep working.
export type { ProviderRoutingDecision };
