import { buildSaleBuyerMetadata, type SaleBuyerMetadataInput } from './sales.helpers.shared';

/**
 * PIX-specific pure helpers extracted from {@link SalesService}. Builds the
 * PIX-flavored metadata stamped on sale rows plus the chat-facing
 * {@link CreatePixOrderResult} shape returned by `createPixOrder`.
 *
 * Re-exported from the {@link ./sales.helpers.ts} barrel.
 */

/**
 * Build the PIX-specific metadata applied to the sale row after the MP charge
 * succeeds (preserves the buyer block, layers in the external ids / status).
 */
export function buildPixSaleUpdateMetadata(
  buyer: SaleBuyerMetadataInput,
  pixExternalId: string,
  pixStatus: string,
): Record<string, string> {
  return {
    ...buildSaleBuyerMetadata(buyer),
    pixExternalId,
    pixStatus,
  };
}

export interface PixOrderResultInput {
  saleId: string;
  expiresAt: Date;
  pixResult: {
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl: string;
    externalId: string;
  };
}

/**
 * Build the {@link CreatePixOrderResult} the chat surface receives. Prefers
 * the raw `qrCode` (copia-e-cola string) for `pixQrCode` and falls back to the
 * base64 PNG when the copia-e-cola is empty — matches the historical
 * {@link SalesService.createPixOrder} return shape exactly.
 */
export function buildPixOrderResult(input: PixOrderResultInput): {
  saleId: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  pixCopyPaste: string;
  pixExpiresAt: Date;
  externalPaymentId: string;
  ticketUrl: string;
} {
  const { pixResult } = input;
  return {
    saleId: input.saleId,
    pixQrCode: pixResult.qrCode || pixResult.qrCodeBase64,
    pixQrCodeBase64: pixResult.qrCodeBase64,
    pixCopyPaste: pixResult.qrCode,
    pixExpiresAt: input.expiresAt,
    externalPaymentId: pixResult.externalId,
    ticketUrl: pixResult.ticketUrl,
  };
}
