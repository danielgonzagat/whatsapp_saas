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

/** A real PIX instrument: both copy-paste and QR are non-empty strings. */
export interface PixOrderV2Instrument {
  pixCopyPaste: string;
  pixQrCode: string;
}

/**
 * Resolve the final PIX strings returned by V2 from the
 * {@link SmartPaymentService} response. Returns `null` when the upstream
 * payment provider did not produce a real PIX instrument (missing/blank
 * copy-paste or QR). The caller MUST treat `null` as a provider failure and
 * surface an honest error — never fabricate a payment instrument, since a
 * synthetic QR/copy-paste cannot actually be paid and silently breaks the
 * money flow (the buyer scans a code that goes nowhere).
 */
export function pickPixOrderV2Result(
  smart: { pixCopyPaste?: string | null; pixQrCode?: string | null } | null | undefined,
): PixOrderV2Instrument | null {
  if (!smart) {
    return null;
  }
  const pixCopyPaste = typeof smart.pixCopyPaste === 'string' ? smart.pixCopyPaste.trim() : '';
  const pixQrCode = typeof smart.pixQrCode === 'string' ? smart.pixQrCode.trim() : '';
  if (!pixCopyPaste || !pixQrCode) {
    return null;
  }
  return { pixCopyPaste, pixQrCode };
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

// NOTE: The previous `buildPixOrderV2FallbackResult` helper was removed
// intentionally. It fabricated a synthetic EMV-coded PIX copy-paste string
// and a `data:image/png;base64,stub_qr_*` QR code and returned them as if
// they were a real payment instrument when SmartPaymentService was
// unavailable. A buyer can never actually pay a fabricated QR/copy-paste, so
// returning one silently broke the money flow. The V2 flow now surfaces an
// honest `ServiceUnavailableException` when the gateway produces no real PIX
// instrument — see `SalesService.createPixOrderV2` and `pickPixOrderV2Result`.

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
