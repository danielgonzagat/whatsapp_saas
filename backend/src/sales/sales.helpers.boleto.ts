import type { BoletoChargeAddress } from '../payments/mercadopago/mercadopago.types';

import { buildSaleBuyerMetadata, type SaleBuyerMetadataInput } from './sales.helpers.shared';

/**
 * Boleto-specific pure helpers extracted from {@link SalesService}. Builds the
 * address metadata, sale-row metadata variants and chat-facing
 * {@link CreateBoletoOrderResult} shape returned by `createBoletoOrder`.
 *
 * Re-exported from the {@link ./sales.helpers.ts} barrel.
 */

/**
 * Compact metadata representation of a buyer address, dropping the optional
 * `neighborhood` field when absent so the JSON payload stays clean.
 */
export function buildBoletoAddressMetadata(address: BoletoChargeAddress): Record<string, string> {
  return {
    zipCode: address.zipCode,
    street: address.street,
    number: address.number,
    ...(address.neighborhood ? { neighborhood: address.neighborhood } : {}),
    city: address.city,
    state: address.state,
  };
}

/**
 * Build the boleto metadata stored when the sale row is created (buyer block
 * plus the compact address representation).
 */
export function buildBoletoSaleCreateMetadata(
  buyer: SaleBuyerMetadataInput,
  buyerAddressMetadata: Record<string, string>,
): Record<string, string | Record<string, string>> {
  return {
    ...buildSaleBuyerMetadata(buyer),
    buyerAddress: buyerAddressMetadata,
  };
}

export interface BoletoUpdateMetadataInput {
  buyer: SaleBuyerMetadataInput;
  buyerAddressMetadata: Record<string, string>;
  externalId: string;
  status: string;
  barcode: string;
}

/**
 * Build the boleto-specific metadata applied to the sale row after the MP
 * charge succeeds.
 */
export function buildBoletoSaleUpdateMetadata(
  input: BoletoUpdateMetadataInput,
): Record<string, string | Record<string, string>> {
  return {
    ...buildSaleBuyerMetadata(input.buyer),
    buyerAddress: input.buyerAddressMetadata,
    boletoExternalId: input.externalId,
    boletoStatus: input.status,
    boletoBarcode: input.barcode,
  };
}

export interface BoletoOrderResultInput {
  saleId: string;
  boletoResult: {
    digitableLine: string;
    barcodeContent: string;
    expiresAt: Date;
    ticketUrl: string;
    externalId: string;
  };
}

/**
 * Build the {@link CreateBoletoOrderResult} the chat surface receives. Prefers
 * the human-readable digitable line for `boletoBarcode`, falling back to the
 * raw barcode content when MP returns an empty digitable line.
 */
export function buildBoletoOrderResult(input: BoletoOrderResultInput): {
  saleId: string;
  boletoBarcode: string;
  boletoExpiresAt: Date;
  boletoUrl: string;
  externalPaymentId: string;
} {
  const { boletoResult } = input;
  return {
    saleId: input.saleId,
    boletoBarcode: boletoResult.digitableLine || boletoResult.barcodeContent,
    boletoExpiresAt: boletoResult.expiresAt,
    boletoUrl: boletoResult.ticketUrl,
    externalPaymentId: boletoResult.externalId,
  };
}
