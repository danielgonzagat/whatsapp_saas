import { BadRequestException } from '@nestjs/common';

import type { Prisma, PrepaidWalletTxType } from '@prisma/client';

import type { StripeClient, StripePaymentIntent } from '../billing/stripe-types';
import type { FraudReason } from '../payments/fraud/fraud.types';

/** Stripe SDK input shape for `paymentIntents.create` — derived from the
 * SDK type so helper builders stay aligned without copying Stripe's
 * verbose union by hand. */
type StripePaymentIntentCreateParams = Parameters<StripeClient['paymentIntents']['create']>[0];

import type { CreateTopupIntentResult } from './wallet.types';

/**
 * Pure helpers extracted from `wallet.service.ts` so the service stays focused
 * on orchestration. Anything that touches Prisma, Stripe, MercadoPago, or
 * NestJS DI stays in the service; only side-effect-free
 * parsing/formatting/derivation lives here.
 *
 * Hard rule: NO money arithmetic in this file. Helpers may inspect amounts,
 * normalize sign (`absAmountCents`), or format strings, but never combine two
 * money operands into a third value — that stays inside the Prisma
 * transaction in the service so the audit trail and atomicity are obvious.
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

/**
 * Assert that a top-up amount is strictly positive. Pure validation — no
 * arithmetic. Throws `RangeError` consistently with the rest of the service
 * so callers can attribute the failure precisely.
 */
export function assertPositiveTopupAmount(amountCents: bigint): void {
  if (amountCents <= 0n) {
    throw new RangeError(
      `createTopupIntent: amountCents must be > 0 (got ${amountCents.toString()})`,
    );
  }
}

/**
 * Assert that a quoted usage cost is strictly positive. Mirrors the
 * historical inline guard in `chargeForUsage`. Uses an assertion predicate
 * so the caller's variable is narrowed to `bigint` without a cast.
 */
export function assertValidQuotedCost(
  quotedCostCents: bigint | undefined,
): asserts quotedCostCents is bigint {
  if (!quotedCostCents || quotedCostCents <= 0n) {
    throw new RangeError(
      `chargeForUsage: quotedCostCents must be > 0 (got ${quotedCostCents?.toString() ?? 'undefined'})`,
    );
  }
}

/**
 * Assert that a catalog `units` argument is a positive finite number.
 * Narrows to `number` after the call so the caller can use it without a
 * cast.
 */
export function assertValidUsageUnits(units: number | undefined): asserts units is number {
  if (!units || units <= 0 || !Number.isFinite(units)) {
    throw new RangeError(`chargeForUsage: units must be > 0 (got ${units})`);
  }
}

/**
 * Assert that the caller supplied exactly one pricing basis for
 * `chargeForUsage`: either catalog units or a quoted cost. Sending both — or
 * neither — is a programmer error.
 */
export function assertExclusivePricingBasis(hasQuotedCost: boolean, hasUnits: boolean): void {
  if (hasQuotedCost === hasUnits) {
    throw new RangeError(
      'chargeForUsage: provide exactly one pricing basis (units or quotedCostCents)',
    );
  }
}

/**
 * Assert that a settlement `actualCostCents` is non-negative. Zero is allowed
 * because a provider may report a free request after the fact.
 */
export function assertNonNegativeActualCost(actualCostCents: bigint): void {
  if (actualCostCents < 0n) {
    throw new RangeError(
      `settleUsageCharge: actualCostCents must be >= 0 (got ${actualCostCents.toString()})`,
    );
  }
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
 * Render a fraud decision's reason list as the comma-separated `signal`
 * string the service writes to its warn logs. Centralized so the log shape
 * stays stable across block/review/3DS branches.
 */
export function buildFraudReasonsLog(reasons: readonly FraudReason[]): string {
  return reasons.map((reason) => reason.signal).join(',');
}

/**
 * Classify a `FraudDecision` against a top-up `method` into the action the
 * service should take:
 *  - `block` — reject with a hard error.
 *  - `review` — reject and route to manual review (also covers `require_3ds`
 *    on non-card methods, where 3DS isn't applicable).
 *  - `allow` — proceed to charge creation.
 *
 * Pure decision logic: the helper takes no logger and no exception thrower,
 * the service composes those side effects.
 */
export function classifyTopupFraudDecision(
  decision: { action: 'allow' | 'block' | 'review' | 'require_3ds' },
  method: 'pix' | 'card',
): 'block' | 'review' | 'allow' {
  if (decision.action === 'block') {
    return 'block';
  }
  if (decision.action === 'review' || (decision.action === 'require_3ds' && method !== 'card')) {
    return 'review';
  }
  return 'allow';
}

/**
 * Build the warning log tag for a non-allow fraud gate decision.
 * Maps `block` → `'blocked by antifraud'`, `review` → `'routed to review'`.
 */
export function buildFraudGateWarningMessage(gate: 'block' | 'review'): string {
  return gate === 'block' ? 'blocked by antifraud' : 'routed to review';
}

/**
 * Build the PT-BR user-facing error message for a fraud gate decision.
 * `block` → hard rejection, `review` → manual review notification.
 */
export function buildFraudGateUserMessage(gate: 'block' | 'review'): string {
  return gate === 'block'
    ? 'Recarga bloqueada pela política antifraude.'
    : 'Recarga retida para revisão manual.';
}

/**
 * Extract the wallet ID from a Stripe PaymentIntent metadata.
 * Returns `null` when the metadata is missing the `wallet_id` field.
 */
export function extractStripeTopupWalletId(intent: StripePaymentIntent): string | null {
  return intent.metadata?.wallet_id ?? null;
}

/**
 * Check whether a Stripe PaymentIntent carries valid wallet top-up metadata.
 * Returns `false` when wallet_id is absent or amount is non-positive, so
 * callers can short-circuit without touching the database.
 */
export function isValidStripeTopupPaymentIntent(intent: StripePaymentIntent): boolean {
  return !!intent.metadata?.wallet_id && BigInt(intent.amount) > 0n;
}

/**
 * Absolute value for a signed-cents amount. USAGE rows store debits as a
 * negative `amountCents`, so several reconciliation paths need the positive
 * twin without recomputing it ad-hoc.
 *
 * Not arithmetic in the money sense — it normalizes the sign of a single
 * value, no new ledger entry is derived from the result.
 */
export function absAmountCents(amount: bigint): bigint {
  return amount < 0n ? -amount : amount;
}

/**
 * Build the idempotency lookup arguments for
 * `prepaidWalletTransaction.findFirst`. Each wallet write begins with this
 * exact `(referenceType, referenceId, type)` lookup so duplicate webhook /
 * retry deliveries return the previous row instead of creating a fresh
 * one. Centralizing the query shape keeps the idempotency contract obvious
 * and prevents columns from drifting between call sites.
 *
 * Pure: only assembles a Prisma `where`-clause literal. Prisma itself runs
 * the query.
 */
export function buildExistingTxQuery(
  referenceType: string,
  referenceId: string,
  type: PrepaidWalletTxType,
): Prisma.PrepaidWalletTransactionFindFirstArgs {
  return { where: { referenceType, referenceId, type } };
}

/**
 * Audit envelope for `chargeForUsage`. Pure derivation: receives the
 * already-computed cost and renders the JSON-safe `metadata` body persisted
 * on the wallet transaction. Costs are stringified because they're bigint
 * and Prisma's JSON column can't carry bigint natively.
 */
export function buildUsageMetadata(input: {
  operation: string;
  billingMode: 'provider_quote' | 'catalog';
  costCents: bigint;
  units?: number;
  pricePerUnitCents?: bigint;
  callerMetadata?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  if (input.billingMode === 'provider_quote') {
    return {
      operation: input.operation,
      billingMode: 'provider_quote',
      quotedCostCents: input.costCents.toString(),
      ...(input.callerMetadata ?? {}),
    };
  }
  return {
    operation: input.operation,
    billingMode: 'catalog',
    units: input.units,
    pricePerUnitCents: input.pricePerUnitCents?.toString(),
    ...(input.callerMetadata ?? {}),
  };
}

/**
 * Audit envelope for `settleUsageCharge`. Captures the original charged
 * amount, the provider-reported actual, and the delta — so an auditor can
 * reconstruct the reconciliation without consulting the original usage row.
 */
export function buildSettlementMetadata(input: {
  operation: string;
  reason: string;
  actualCostCents: bigint;
  chargedCostCents: bigint;
  deltaCents: bigint;
  originalUsageTransactionId: string;
  callerMetadata?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return {
    operation: input.operation,
    reason: input.reason,
    actualCostCents: input.actualCostCents.toString(),
    chargedCostCents: input.chargedCostCents.toString(),
    deltaCents: input.deltaCents.toString(),
    originalUsageTransactionId: input.originalUsageTransactionId,
    ...(input.callerMetadata ?? {}),
  };
}

/**
 * Audit envelope for `refundUsageCharge`.
 */
export function buildRefundMetadata(input: {
  operation: string;
  reason: string;
  originalUsageTransactionId: string;
  callerMetadata?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  return {
    operation: input.operation,
    reason: input.reason,
    originalUsageTransactionId: input.originalUsageTransactionId,
    ...(input.callerMetadata ?? {}),
  };
}

/**
 * Shape a Stripe PaymentIntent into the `CreateTopupIntentResult` returned
 * by the card top-up path. Pure projection — no Stripe SDK calls.
 */
export function shapeStripeIntentResult(intent: StripePaymentIntent): CreateTopupIntentResult {
  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret ?? null,
  };
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
 * Build the metadata literal persisted on a Stripe card top-up
 * `PaymentIntent`. Centralizes the `type=wallet_topup` /
 * `method=card` convention so card flows can be audited consistently.
 */
export function buildStripeTopupMetadata(input: { workspaceId: string; walletId: string }): {
  type: 'wallet_topup';
  wallet_id: string;
  workspace_id: string;
  method: 'card';
} {
  return {
    type: 'wallet_topup',
    wallet_id: input.walletId,
    workspace_id: input.workspaceId,
    method: 'card',
  };
}

/**
 * Build the full `paymentIntents.create` parameter object for a Stripe
 * card top-up. Captures the 3DS-on-review escalation in one place so the
 * service body stops growing each time the fraud policy adds a knob.
 *
 * Pure derivation: no Stripe SDK calls, no clocks. The shape matches
 * what `Stripe.PaymentIntentCreateParams` expects but we return a plain
 * record to avoid pulling Stripe types here.
 */
export function buildStripeTopupIntentParams(input: {
  amountCents: bigint;
  currency: string;
  workspaceId: string;
  walletId: string;
  forceThreeDS: boolean;
}): StripePaymentIntentCreateParams {
  return {
    amount: Number(input.amountCents),
    currency: input.currency.toLowerCase(),
    payment_method_types: ['card'],
    ...(input.forceThreeDS
      ? {
          payment_method_options: {
            card: { request_three_d_secure: 'any' as const },
          },
        }
      : {}),
    metadata: buildStripeTopupMetadata({
      workspaceId: input.workspaceId,
      walletId: input.walletId,
    }),
    description: `Kloel prepaid wallet top-up - workspace ${input.workspaceId}`,
  };
}

/**
 * Build the metadata literal persisted on a Stripe TOPUP wallet
 * transaction once a webhook confirms the PaymentIntent. Pulls `method`
 * from the upstream `PaymentIntent.metadata` so a card top-up and a
 * future apple-pay top-up stay distinguishable.
 */
export function buildStripeTopupTransactionMetadata(input: {
  paymentMethod: string | null | undefined;
}): { method: string | null } {
  return { method: input.paymentMethod ?? null };
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
 * Build the Sentry envelope reported when a Stripe top-up webhook
 * references a wallet that has disappeared from the DB. The envelope is
 * pure data — the actual `Sentry.captureException` call stays in the
 * service so it remains visible at the call site.
 */
export function buildWalletNotFoundOnStripeWebhookReport(input: {
  walletId: string;
  paymentIntentId: string;
}): { error: Error; extra: { walletId: string; paymentIntentId: string } } {
  return {
    error: new Error(
      `wallet_not_found_on_webhook: wallet=${input.walletId} pi=${input.paymentIntentId}`,
    ),
    extra: { walletId: input.walletId, paymentIntentId: input.paymentIntentId },
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

/**
 * Build the Sentry envelope reported when a usage debit lands on a wallet
 * with insufficient balance. Captures the requested cost vs. the
 * available balance as strings so bigint values survive Sentry's JSON
 * serialization.
 */
export function buildInsufficientBalanceReport(input: {
  walletId: string;
  workspaceId: string;
  operation: string;
  costCents: bigint;
  balanceCents: bigint;
}): {
  error: Error;
  extra: {
    walletId: string;
    workspaceId: string;
    operation: string;
    costCents: string;
    balanceCents: string;
  };
} {
  return {
    error: new Error(
      `prepaid_wallet_insufficient: id=${input.walletId} need=${input.costCents.toString()} have=${input.balanceCents.toString()}`,
    ),
    extra: {
      walletId: input.walletId,
      workspaceId: input.workspaceId,
      operation: input.operation,
      costCents: input.costCents.toString(),
      balanceCents: input.balanceCents.toString(),
    },
  };
}
