/**
 * Pure helpers extracted from {@link SalesService} tier-5 capability methods
 * (PI-K37: {@link SalesService.createPixOrder} V2 overload,
 * {@link SalesService.fillBuyerData}, and {@link SalesService.refund}).
 *
 * These helpers are isolated from Nest/Prisma so they can be unit-tested
 * without bootstrapping the module. The service composes them into the
 * transaction/database flows.
 */

import type { Prisma } from '@prisma/client';
import { sanitizeDocumentDigits } from './sales.helpers';

// ---------------------------------------------------------------------------
// createPixOrder V2 (tier-5) helpers
// ---------------------------------------------------------------------------

export interface PixOrderV2Buyer {
  name: string;
  email: string;
  phone?: string;
  cpf?: string;
}

/** DTO shape for the tier-5 `createPixOrder` overload. */
export interface CreatePixOrderV2Dto {
  productId: string;
  planId?: string;
  buyer: PixOrderV2Buyer;
}

/** Result shape for the tier-5 `createPixOrder` overload. */
export interface CreatePixOrderV2Result {
  orderId: string;
  pixCopyPaste: string;
  pixQrCode: string;
  amountCents: bigint;
  expiresAt: Date;
}

/**
 * Compute the order amount in centavos from the plan's float price.
 * Matches V1 behavior via {@link planPriceToCents} but accepts a raw number
 * directly (V2 selects only `{ id, name, price }` from the plan).
 */
export function computePixOrderV2AmountCents(planPriceFloat: number): bigint {
  return BigInt(Math.round(planPriceFloat * 100));
}

/**
 * Pick the final PIX strings returned by V2: prefer the
 * {@link SmartPaymentService} response, falling back to the deterministic
 * fallback when the upstream payload is missing a copy-paste or QR string.
 */
export function pickPixOrderV2Result(
  orderId: string,
  smart: { pixCopyPaste?: string | null; pixQrCode?: string | null } | null | undefined,
  fallback: PixOrderV2FallbackResult,
): PixOrderV2FallbackResult {
  if (!smart) {
    return fallback;
  }
  return {
    pixCopyPaste: smart.pixCopyPaste ?? `PIX_COPIA_E_COLA_${orderId}`,
    pixQrCode: smart.pixQrCode ?? `PIX_QR_${orderId}`,
  };
}

export interface PixOrderV2SaleDataInput {
  orderId: string;
  workspaceId: string;
  productId: string;
  planId: string;
  productName: string;
  amount: number;
  buyer: PixOrderV2Buyer;
}

/**
 * Build the `KloelSale.create` `data` block for the tier-5 PIX flow.
 *
 * Mirrors the V1 schema (see {@link buildKloelSaleCreateData}) but uses the
 * tier-5 specific metadata shape — including the `capability` discriminator
 * (`sales.create_pix`) used by downstream analytics to distinguish K37 flows.
 */
export function buildPixOrderV2SaleData(
  input: PixOrderV2SaleDataInput,
): Prisma.KloelSaleUncheckedCreateInput {
  const { orderId, workspaceId, productId, planId, productName, amount, buyer } = input;
  const metadata: Record<string, unknown> = {
    productId,
    planId,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    capability: 'sales.create_pix',
  };
  if (buyer.cpf) {
    metadata.buyerCpf = sanitizeDocumentDigits(buyer.cpf);
  }
  return {
    id: orderId,
    workspaceId,
    productName,
    amount,
    status: 'pending',
    paymentMethod: 'PIX',
    leadPhone: buyer.phone ?? null,
    metadata: metadata as Prisma.InputJsonValue,
  };
}

export interface PixOrderV2FallbackInput {
  orderId: string;
  amountCents: bigint;
  buyerName: string;
}

export interface PixOrderV2FallbackResult {
  pixCopyPaste: string;
  pixQrCode: string;
}

/**
 * Build deterministic PIX copy-paste + QR code fallback strings used when
 * {@link SmartPaymentService} is unavailable or fails. The format mirrors
 * a minimal EMV-coded PIX payload so the rest of the pipeline (storage,
 * webhook fallback, audit) keeps working with realistic-looking values
 * during dev/test runs.
 */
export function buildPixOrderV2FallbackResult(
  input: PixOrderV2FallbackInput,
): PixOrderV2FallbackResult {
  const { orderId, amountCents, buyerName } = input;
  const sanitizedOrderId = orderId.replace(/-/g, '');
  const amountField = String(amountCents).padStart(2, '0');
  const trimmedName = buyerName.slice(0, 25);
  return {
    pixCopyPaste: `00020126580014BR.GOV.BCB.PIX0136${sanitizedOrderId}5204000053039865405${amountField}5802BR5925${trimmedName}6009SAO PAULO62070503***6304AB12`,
    pixQrCode: `data:image/png;base64,stub_qr_${orderId}`,
  };
}

// ---------------------------------------------------------------------------
// fillBuyerData helpers
// ---------------------------------------------------------------------------

export interface FillBuyerDataDto {
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
}

/**
 * Build the `metadata` patch object for {@link SalesService.fillBuyerData}.
 * Returns an empty record when no DTO fields are present, allowing the
 * service to short-circuit the DB write when there is nothing to update.
 */
export function buildFillBuyerDataPatch(dto: FillBuyerDataDto): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (dto.name !== undefined) {
    patch.buyerName = dto.name;
  }
  if (dto.email !== undefined) {
    patch.buyerEmail = dto.email;
  }
  if (dto.phone !== undefined) {
    patch.buyerPhone = dto.phone;
  }
  if (dto.cpf !== undefined) {
    patch.buyerCpf = sanitizeDocumentDigits(dto.cpf);
  }
  return patch;
}

// ---------------------------------------------------------------------------
// refund helpers
// ---------------------------------------------------------------------------

export interface RefundUpdateMetadataInput {
  refundId: string;
  reason: string;
  amountCents: bigint;
  originalStatus: string;
  refundedAt?: Date;
}

/**
 * Build the `metadata` block written to `KloelSale` when a refund is recorded.
 * `refundedAt` defaults to `new Date()` so callers can override for tests.
 */
export function buildRefundUpdateMetadata(
  input: RefundUpdateMetadataInput,
): Record<string, unknown> {
  const { refundId, reason, amountCents, originalStatus, refundedAt } = input;
  return {
    refundId,
    refundReason: reason,
    refundAmountCents: amountCents.toString(),
    refundedAt: (refundedAt ?? new Date()).toISOString(),
    originalStatus,
  };
}

/**
 * Compute refund amount in centavos: defaults to the full sale amount when
 * the DTO omits a partial amount.
 */
export function resolveRefundAmountCents(
  saleAmount: number,
  requestedAmountCents: bigint | undefined,
): bigint {
  return requestedAmountCents ?? BigInt(Math.round(saleAmount * 100));
}

/**
 * Format the idempotent refund id derived from the order id.
 */
export function buildRefundId(orderId: string): string {
  return `refund_${orderId}`;
}
