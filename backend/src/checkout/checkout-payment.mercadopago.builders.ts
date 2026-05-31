import { Prisma } from '@prisma/client';

import type { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import type { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';

import {
  buildPaymentDescription,
  normalizeBoletoAddress,
  toJsonValue,
} from './checkout-payment.mappers';
import { type CheckoutPaymentStatus, type PixDisplayData } from './checkout-payment.types';

/**
 * Mercado Pago-specific input/output envelope builders for the checkout payment
 * service. Extracted from `checkout-payment.builders.ts` (Gate-fix2-D,
 * 2026-05-28) so the PIX/boleto arms can be reviewed in isolation from the
 * Stripe arm. Pure builders — no money math, no I/O.
 */

type MercadoPagoBoletoCharge = Awaited<ReturnType<MercadoPagoBoletoChargeService['create']>>;
type MercadoPagoPixCharge = Awaited<ReturnType<MercadoPagoPixChargeService['create']>>;
type MercadoPagoPixCreateInput = Parameters<MercadoPagoPixChargeService['create']>[0];
type MercadoPagoBoletoCreateInput = Parameters<MercadoPagoBoletoChargeService['create']>[0];

/**
 * Build the `Prisma.CheckoutPaymentUncheckedCreateInput` envelope persisted for
 * a Mercado Pago PIX charge. Pure formatter — no money math.
 */
export function buildMercadoPagoPixPaymentData(input: {
  orderId: string;
  status: CheckoutPaymentStatus;
  pixData: PixDisplayData;
  charge: MercadoPagoPixCharge;
}): Prisma.CheckoutPaymentUncheckedCreateInput {
  return {
    orderId: input.orderId,
    gateway: 'mercadopago',
    externalId: input.charge.externalId,
    pixQrCode: input.pixData.pixQrCode,
    pixCopyPaste: input.pixData.pixCopyPaste,
    pixExpiresAt: input.pixData.pixExpiresAt ? new Date(input.pixData.pixExpiresAt) : null,
    boletoUrl: null,
    boletoBarcode: null,
    boletoExpiresAt: null,
    cardLast4: null,
    cardBrand: null,
    status: input.status,
    webhookData: toJsonValue({
      provider: 'mercadopago',
      paymentMethod: 'pix',
      payment: input.charge.raw,
    }),
  };
}

/**
 * Build the `Prisma.CheckoutPaymentUncheckedCreateInput` envelope persisted for
 * a Mercado Pago boleto charge. Pure formatter — no money math.
 */
export function buildMercadoPagoBoletoPaymentData(input: {
  orderId: string;
  status: CheckoutPaymentStatus;
  charge: MercadoPagoBoletoCharge;
}): Prisma.CheckoutPaymentUncheckedCreateInput {
  return {
    orderId: input.orderId,
    gateway: 'mercadopago',
    externalId: input.charge.externalId,
    pixQrCode: null,
    pixCopyPaste: null,
    pixExpiresAt: null,
    boletoUrl: input.charge.ticketUrl,
    boletoBarcode: input.charge.digitableLine || input.charge.barcodeContent,
    boletoExpiresAt: input.charge.expiresAt,
    cardLast4: null,
    cardBrand: null,
    status: input.status,
    webhookData: toJsonValue({
      provider: 'mercadopago',
      paymentMethod: 'boleto',
      payment: input.charge.raw,
    }),
  };
}

/**
 * Build the Mercado Pago PIX charge input envelope. Pure builder — copies caller
 * money values verbatim into `bigint` and assembles the description/notification
 * URL. No money arithmetic and no I/O. The `payerDocument` field is omitted when
 * the caller has no document (mirrors prior conditional spread behavior).
 */
export function buildMercadoPagoPixChargeInput(input: {
  idempotencyKey: string;
  chargedTotalInCents: number;
  payerEmail: string;
  payerName: string;
  payerDocument?: string;
  productName: string | undefined;
  orderId: string;
  expiresAt: Date;
  notificationUrl: string;
}): MercadoPagoPixCreateInput {
  const base: MercadoPagoPixCreateInput = {
    idempotencyKey: input.idempotencyKey,
    amountCents: BigInt(input.chargedTotalInCents),
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    description: buildPaymentDescription(input.productName, input.orderId),
    externalReference: input.orderId,
    expiresAt: input.expiresAt,
    notificationUrl: input.notificationUrl,
  };
  return input.payerDocument !== undefined ? { ...base, payerDocument: input.payerDocument } : base;
}

/**
 * Build the Mercado Pago boleto charge input envelope. Pure builder — copies caller
 * money values verbatim into `bigint`, assembles the description, and forwards the
 * payer address verbatim. No money arithmetic and no I/O.
 */
export function buildMercadoPagoBoletoChargeInput(input: {
  idempotencyKey: string;
  chargedTotalInCents: number;
  payerEmail: string;
  payerName: string;
  payerDocument: string;
  payerAddress: NonNullable<ReturnType<typeof normalizeBoletoAddress>>;
  productName: string | undefined;
  orderId: string;
  expiresAt: Date;
  notificationUrl: string;
}): MercadoPagoBoletoCreateInput {
  return {
    idempotencyKey: input.idempotencyKey,
    amountCents: BigInt(input.chargedTotalInCents),
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    payerDocument: input.payerDocument,
    payerAddress: input.payerAddress,
    description: buildPaymentDescription(input.productName, input.orderId),
    externalReference: input.orderId,
    expiresAt: input.expiresAt,
    notificationUrl: input.notificationUrl,
  };
}
