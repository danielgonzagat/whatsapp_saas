/**
 * Public type contracts for {@link SalesService}. Extracted from the service
 * file so both the service and its V1 orchestrator helpers
 * ({@link ./sales.service.v1-orders}) can share them without circular
 * dependencies.
 */

import type { BoletoChargeAddress } from '../payments/mercadopago/mercadopago.types';

export interface BuyerData {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
}

export interface BoletoBuyerData extends BuyerData {
  address: BoletoChargeAddress;
}

export interface CreatePixOrderResult {
  saleId: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  pixCopyPaste: string;
  pixExpiresAt: Date;
  externalPaymentId: string;
  ticketUrl: string;
}

export interface CreateBoletoOrderResult {
  saleId: string;
  boletoBarcode: string;
  boletoExpiresAt: Date;
  boletoUrl: string;
  externalPaymentId: string;
}

export interface CreateStripeCardLinkResult {
  saleId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  externalPaymentId: string;
}
