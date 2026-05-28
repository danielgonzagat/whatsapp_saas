import { Prisma } from '@prisma/client';

import type { StripeChargeService } from '../payments/stripe/stripe-charge.service';

import { toJsonValue } from './checkout-payment.mappers';
import {
  type CheckoutPaymentStatus,
  type PixDisplayData,
  STRIPE_THREE_DS_REQUEST_ANY,
} from './checkout-payment.types';

/**
 * Stripe-specific input/output envelope builders for the checkout payment
 * service. Extracted from `checkout-payment.builders.ts` (Gate-fix2-D,
 * 2026-05-28) so the Stripe arm can be reviewed in isolation from the Mercado
 * Pago arms. Pure builders — no money math, no I/O.
 */

type SaleChargeInput = Parameters<StripeChargeService['createSaleCharge']>[0];
type StripeSaleCharge = Awaited<ReturnType<StripeChargeService['createSaleCharge']>>;
type CardPaymentOptions = Extract<
  NonNullable<NonNullable<SaleChargeInput['paymentMethodOptions']>['card']>,
  object
>;

/**
 * Build the `StripeChargeService.createSaleCharge` input envelope for a checkout
 * payment. Pure builder — copies caller-supplied amount fields verbatim into
 * `bigint`, attaches the optional 3DS request flag, and assembles the metadata
 * tag. No money arithmetic and no I/O; the inputs already arrived as exact
 * integer cents.
 */
export function buildStripeChargeInput(
  params: {
    orderId: string;
    idempotencyKey?: string;
    workspaceId: string;
    customerEmail: string;
  },
  opts: {
    sellerStripeAccountId: string;
    currency: string;
    baseTotalInCents: number;
    chargedTotalInCents: number;
    marketplaceFeeInCents: number;
    interestInCents: number;
    forceThreeDS?: boolean;
  },
): SaleChargeInput {
  const threeDsRequest = STRIPE_THREE_DS_REQUEST_ANY as NonNullable<
    CardPaymentOptions['request_three_d_secure']
  >;
  const paymentMethodOptions: SaleChargeInput['paymentMethodOptions'] | undefined =
    opts.forceThreeDS
      ? {
          card: {
            request_three_d_secure: threeDsRequest,
          },
        }
      : undefined;

  const base: SaleChargeInput = {
    workspaceId: params.workspaceId,
    sellerStripeAccountId: opts.sellerStripeAccountId,
    buyerPaidCents: BigInt(opts.chargedTotalInCents),
    saleValueCents: BigInt(opts.baseTotalInCents),
    interestCents: BigInt(opts.interestInCents),
    marketplaceFeeCents: BigInt(opts.marketplaceFeeInCents),
    currency: opts.currency,
    idempotencyKey: params.idempotencyKey || params.orderId,
    buyerEmail: params.customerEmail,
    paymentMethodTypes: ['card'],
    metadata: {
      kloel_order_id: params.orderId,
      workspace_id: params.workspaceId,
    },
  };
  if (paymentMethodOptions !== undefined) {
    base.paymentMethodOptions = paymentMethodOptions;
  }
  return base;
}

/**
 * Build the `Prisma.CheckoutPaymentUncheckedCreateInput` envelope persisted for
 * a Stripe (card) charge. Pure formatter — webhookData is serialized via
 * `toJsonValue`; no money math (provider-supplied amounts already settled).
 */
export function buildStripePaymentData(input: {
  orderId: string;
  cardLast4: string | null;
  status: CheckoutPaymentStatus;
  pixData: PixDisplayData;
  charge: StripeSaleCharge;
}): Prisma.CheckoutPaymentUncheckedCreateInput {
  return {
    orderId: input.orderId,
    gateway: 'stripe',
    externalId: input.charge.paymentIntentId,
    pixQrCode: input.pixData.pixQrCode,
    pixCopyPaste: input.pixData.pixCopyPaste,
    pixExpiresAt: input.pixData.pixExpiresAt ? new Date(input.pixData.pixExpiresAt) : null,
    boletoUrl: null,
    boletoBarcode: null,
    boletoExpiresAt: null,
    cardLast4: input.cardLast4,
    cardBrand: null,
    status: input.status,
    webhookData: toJsonValue({
      provider: 'stripe',
      paymentIntent: input.charge.stripePaymentIntent,
      split: input.charge.split,
      splitInput: input.charge.splitInput,
    }),
  };
}
