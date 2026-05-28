import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  WALLET_MERCADOPAGO_REFERENCE_TYPE,
  resolveBackendOrigin,
} from './wallet.service.helpers.shared';
import type { CreateTopupIntentResult } from './wallet.types';

/**
 * Mercado Pago-specific pure helpers extracted from `wallet.service.ts`. Owns
 * webhook reference parsing, transaction-amount extraction, QR image
 * formatting, payer-document normalization, PIX charge-request builder, MP
 * topup transaction metadata + ledger row builder, the
 * `CreateTopupIntentResult` shaper for PIX, and the MP-flavored Sentry
 * wallet-not-found envelope.
 *
 * Re-exported from {@link ./wallet.service.helpers.ts}.
 */

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

/**
 * Normalize a buyer document (CPF/CNPJ) into the digits-only form Mercado
 * Pago expects, or `undefined` when neither field has any digits. Pure
 * string transform — no validation of issuer/checksum.
 */
export function normalizePayerDocument(
  cpf?: string | null,
  cnpj?: string | null,
): string | undefined {
  return (cpf ?? cnpj ?? '').replace(/\D/g, '') || undefined;
}

/**
 * Shape a Mercado Pago `PixChargeResult` into the `CreateTopupIntentResult`
 * returned by the PIX top-up path. Picks `qrCodeBase64` (preferred,
 * already rendered as a data URL) over `ticketUrl` (provider fallback).
 *
 * Pure projection — no Prisma / no MP HTTP calls.
 */
export function shapePixTopupResult(charge: {
  externalId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}): CreateTopupIntentResult {
  const pixQrCodeUrl = formatMercadoPagoQrImage(charge.qrCodeBase64) ?? charge.ticketUrl;
  return {
    paymentIntentId: charge.externalId,
    clientSecret: null,
    ...(charge.qrCode ? { pixQrCode: charge.qrCode } : {}),
    ...(pixQrCodeUrl ? { pixQrCodeUrl } : {}),
  };
}

/**
 * Build the Mercado Pago `create` payload for a wallet PIX top-up. Captures
 * the externalReference / notificationUrl / idempotencyKey conventions in
 * one place so the service body stays readable.
 *
 * Pure derivation: no clocks beyond the caller-supplied `now`, no random
 * IDs (caller passes `nonce`), no env reads beyond
 * `resolveBackendOrigin()`. Tests can mock `now` for deterministic
 * `expiresAt`.
 */
export function buildPixTopupChargeRequest(input: {
  workspaceId: string;
  walletId: string;
  amountCents: bigint;
  payerEmail: string;
  payerDocument: string | undefined;
  nonce: string;
  now: Date;
}): {
  idempotencyKey: string;
  amountCents: bigint;
  payerEmail: string;
  payerDocument?: string;
  description: string;
  externalReference: string;
  expiresAt: Date;
  notificationUrl: string;
} {
  return {
    idempotencyKey: `wallet-topup:${input.workspaceId}:${input.nonce}`,
    amountCents: input.amountCents,
    payerEmail: input.payerEmail,
    ...(input.payerDocument ? { payerDocument: input.payerDocument } : {}),
    description: `Kloel prepaid wallet top-up - workspace ${input.workspaceId}`,
    externalReference: `wallet_topup:${input.workspaceId}:${input.walletId}:${input.nonce}`,
    expiresAt: new Date(input.now.getTime() + PIX_EXPIRATION_MINUTES * 60_000),
    notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
  };
}

/**
 * Build the metadata literal persisted on a Mercado Pago TOPUP wallet
 * transaction once a webhook confirms the payment. Always tags the row
 * with the provider and PIX method so cross-provider audits work.
 */
export function buildMercadoPagoTopupTransactionMetadata(input: { status: string }): {
  provider: 'mercadopago';
  method: 'pix';
  status: string;
} {
  return {
    provider: 'mercadopago',
    method: 'pix',
    status: input.status,
  };
}

/**
 * Shape the `prepaidWalletTransaction.create` data for a Mercado Pago-confirmed
 * TOPUP row. Mirrors `buildStripeTopupCreditTxData` but tags the row with the
 * MP-specific provider/method/status metadata so cross-provider audits work.
 */
export function buildMercadoPagoTopupCreditTxData(input: {
  walletId: string;
  amountCents: bigint;
  newBalanceCents: bigint;
  externalId: string;
  status: string;
}): Prisma.PrepaidWalletTransactionUncheckedCreateInput {
  return {
    walletId: input.walletId,
    type: 'TOPUP',
    amountCents: input.amountCents,
    balanceAfterCents: input.newBalanceCents,
    referenceType: WALLET_MERCADOPAGO_REFERENCE_TYPE,
    referenceId: input.externalId,
    metadata: buildMercadoPagoTopupTransactionMetadata({
      status: input.status,
    }),
  };
}

/**
 * Build the Sentry envelope reported when a Mercado Pago top-up webhook
 * references a wallet that has disappeared from the DB.
 */
export function buildWalletNotFoundOnMercadoPagoWebhookReport(input: {
  walletId: string;
  workspaceId: string;
  externalId: string;
}): {
  error: Error;
  extra: { walletId: string; workspaceId: string; externalId: string };
} {
  return {
    error: new Error(
      `wallet_not_found_on_mercadopago_webhook: wallet=${input.walletId} mp=${input.externalId}`,
    ),
    extra: {
      walletId: input.walletId,
      workspaceId: input.workspaceId,
      externalId: input.externalId,
    },
  };
}
