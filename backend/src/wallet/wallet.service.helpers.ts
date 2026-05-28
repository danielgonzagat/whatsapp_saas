import { BadRequestException } from '@nestjs/common';

/**
 * Pure helpers extracted from `wallet.service.ts` so the service stays focused
 * on orchestration. Anything that touches Prisma, Stripe, MercadoPago, or
 * NestJS DI stays in the service; only side-effect-free
 * parsing/formatting/derivation lives here.
 */

/** Webhook callback path that Mercado Pago will POST to. */
export const MP_WEBHOOK_PATH = '/webhooks/mercadopago';

/** How long a PIX top-up QR code remains valid. */
export const PIX_EXPIRATION_MINUTES = 30;

/** Canonical `referenceType` used to dedupe Mercado Pago wallet top-ups. */
export const WALLET_MERCADOPAGO_REFERENCE_TYPE = 'mercadopago_pix_topup';

/** Default backend origin used when no env vars are set. */
export const DEFAULT_BACKEND_ORIGIN = 'http://localhost:3001';

/**
 * Resolve the public origin of the backend (used to build webhook callback
 * URLs). Falls back through PUBLIC_BACKEND_URL → BACKEND_URL →
 * NEXT_PUBLIC_API_BASE_URL → localhost. Trailing slash is stripped so callers
 * can append paths safely.
 */
export function resolveBackendOrigin(): string {
  return (
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    DEFAULT_BACKEND_ORIGIN
  ).replace(/\/$/, '');
}

/**
 * Convert a Mercado Pago `qrCodeBase64` payload into a `data:` URL ready to
 * render in an `<img>` tag. Returns `undefined` when the provider didn't
 * supply a QR (e.g. ticket-only flows).
 */
export function formatMercadoPagoQrImage(qrCodeBase64: string): string | undefined {
  return qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : undefined;
}

/**
 * Parse a Mercado Pago webhook payload's `external_reference` field to extract
 * the workspace/wallet identifiers. Returns `null` when the reference does not
 * belong to a wallet top-up (so callers can no-op quietly). Throws
 * `BadRequestException` when the reference is malformed — that's an
 * integrity issue worth surfacing.
 */
export function parseMercadoPagoWalletReference(
  raw: unknown,
): { workspaceId: string; walletId: string; nonce: string } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const externalReference = (raw as { external_reference?: unknown }).external_reference;
  if (typeof externalReference !== 'string' || !externalReference.startsWith('wallet_topup:')) {
    return null;
  }
  const [, workspaceId, walletId, nonce] = externalReference.split(':');
  if (!workspaceId || !walletId || !nonce) {
    throw new BadRequestException('mercadopago_wallet_topup_reference_invalid');
  }
  return { workspaceId, walletId, nonce };
}

/**
 * Read the BRL amount (in cents) from a raw Mercado Pago payment payload.
 * Returns `null` for any non-finite, non-positive, or missing amount so the
 * caller can short-circuit and log it.
 */
export function readMercadoPagoTransactionAmountCents(raw: unknown): bigint | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const amount = (raw as { transaction_amount?: unknown }).transaction_amount;
  const numericAmount =
    typeof amount === 'number' || typeof amount === 'string' ? Number(amount) : NaN;
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return null;
  }
  return BigInt(Math.round(numericAmount * 100));
}
