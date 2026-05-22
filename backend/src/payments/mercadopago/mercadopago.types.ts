/**
 * Type definitions for the Mercado Pago PIX adapter.
 *
 * Per ADR-0009 (docs/adr/0009-mercadopago-pix-stripe-card-split.md):
 * Mercado Pago is the canonical PIX provider. This module exposes only
 * the PIX surface — cartão stays in Stripe.
 *
 * Money is always handled in cents (`bigint`). MP API uses
 * `transaction_amount` in floating-point BRL — we convert at the
 * adapter boundary and never propagate floats inward.
 */

/** Configuration loaded from env at module bootstrap. */
export interface MercadoPagoConfig {
  readonly accessToken: string;
  readonly publicKey: string;
  readonly webhookSecret: string;
  readonly sandbox: boolean;
}

/**
 * Input for creating a PIX charge.
 *
 * `idempotencyKey` is required — MP de-duplicates POST /v1/payments
 * by this key in our HTTP header `X-Idempotency-Key`.
 */
export interface CreatePixChargeInput {
  readonly idempotencyKey: string;
  readonly amountCents: bigint;
  readonly payerEmail: string;
  readonly payerName?: string;
  readonly payerDocument?: string; // CPF/CNPJ digits-only
  readonly description: string;
  readonly externalReference: string; // our Order/Checkout id
  readonly expiresAt: Date;
  readonly notificationUrl: string; // webhook callback
}

/** Result of a PIX charge creation. */
export interface PixChargeResult {
  readonly externalId: string; // MP payment id (numeric, string-encoded)
  readonly status: PixChargeStatus;
  readonly qrCode: string; // copia-e-cola string
  readonly qrCodeBase64: string; // PNG image, base64
  readonly ticketUrl: string; // MP-hosted fallback page
  readonly expiresAt: Date;
  readonly raw: unknown; // full MP response for audit
}

/** Canonical PIX charge status (mapped from MP's status strings). */
export type PixChargeStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'in_process';

/** Maps MP API status string to canonical. Returns `pending` for unknown. */
export function toPixChargeStatus(mpStatus: string | null | undefined): PixChargeStatus {
  switch (mpStatus) {
    case 'approved':
    case 'authorized':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'in_process':
    case 'in_mediation':
      return 'in_process';
    case 'pending':
      return 'pending';
    default:
      return 'pending';
  }
}

/**
 * MP webhook payload (`type=payment`, the only one we handle).
 *
 * MP sends both v1 (legacy) and v2 webhooks. We accept both and normalize.
 */
export interface MercadoPagoWebhookPayload {
  readonly type?: string; // 'payment' | 'plan' | 'subscription' | ...
  readonly action?: string; // 'payment.created' | 'payment.updated'
  readonly data?: { id?: string | number };
  readonly resource?: string; // legacy: full URL like .../v1/payments/123
  readonly id?: string | number;
  readonly user_id?: string | number;
  readonly live_mode?: boolean;
  readonly date_created?: string;
}
