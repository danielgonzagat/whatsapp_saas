import { Prisma } from '@prisma/client';

import type { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import type { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';

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
