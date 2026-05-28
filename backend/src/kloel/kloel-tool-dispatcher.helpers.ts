import { isRecord } from './kloel-tool-dispatcher.high-risk.helpers';
import type { UnknownRecord } from '../common/types';

/** Coerce `unknown` to string with a fallback, without triggering no-base-to-string. */
export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Coerce `unknown` to number with a fallback, without unsafe casts. */
export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function missingStringInputs(args: UnknownRecord, keys: string[]): string[] {
  return keys.filter((key) => !asString(args[key]).trim());
}

export function buyerDataFromArgs(args: UnknownRecord): {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
} {
  const phone = asString(args.customerPhone).trim();
  return {
    name: asString(args.customerName).trim(),
    email: asString(args.customerEmail).trim(),
    cpf: asString(args.customerCpf).trim(),
    ...(phone ? { phone } : {}),
  };
}

export function boletoBuyerDataFromArgs(args: UnknownRecord): {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
  address: {
    zipCode: string;
    street: string;
    number: string;
    neighborhood?: string;
    city: string;
    state: string;
  };
} {
  const neighborhood = asString(args.customerNeighborhood).trim();
  return {
    ...buyerDataFromArgs(args),
    address: {
      zipCode: asString(args.customerZipCode).replace(/\D/g, ''),
      street: asString(args.customerStreet).trim(),
      number: asString(args.customerNumber).trim(),
      ...(neighborhood ? { neighborhood } : {}),
      city: asString(args.customerCity).trim(),
      state: asString(args.customerState)
        .replace(/[^a-z]/gi, '')
        .toUpperCase(),
    },
  };
}

export function buildReceiptEvidenceUrl(
  template: string | undefined,
  outputs: UnknownRecord,
): string | undefined {
  if (!template) {
    return undefined;
  }
  return template
    .replace('${productId}', asString(outputs.productId))
    .replace('${orderId}', asString(outputs.orderId))
    .replace('${planId}', asString(outputs.planId))
    .replace('${checkoutId}', asString(outputs.checkoutId))
    .replace('${couponId}', asString(outputs.couponId));
}

export function deriveReceiptOutputs(
  result: UnknownRecord,
  inputs: UnknownRecord = {},
): UnknownRecord {
  const product = isRecord(result.product) ? result.product : null;
  const plan = isRecord(result.plan) ? result.plan : null;
  const checkout = isRecord(result.checkout) ? result.checkout : null;
  const coupon = isRecord(result.coupon) ? result.coupon : null;
  const campaign = isRecord(result.campaign) ? result.campaign : null;
  const productId = asString(
    result.productId,
    product
      ? asString(product.id)
      : asString(
          plan?.productId,
          asString(checkout?.productId, asString(coupon?.productId, asString(inputs.productId))),
        ),
  );
  const orderId = asString(result.orderId, asString(result.saleId));
  const planId = asString(result.planId, plan ? asString(plan.id, asString(inputs.planId)) : '');
  const checkoutId = asString(
    result.checkoutId,
    checkout ? asString(checkout.id, asString(inputs.checkoutId)) : '',
  );
  const couponId = asString(
    result.couponId,
    coupon ? asString(coupon.id, asString(inputs.couponId)) : asString(inputs.couponId),
  );
  const campaignId = asString(
    result.campaignId,
    campaign ? asString(campaign.id, asString(inputs.campaignId)) : asString(inputs.campaignId),
  );

  return {
    ...result,
    ...(productId ? { productId } : {}),
    ...(orderId ? { orderId } : {}),
    ...(planId ? { planId } : {}),
    ...(checkoutId ? { checkoutId } : {}),
    ...(couponId ? { couponId } : {}),
    ...(campaignId ? { campaignId } : {}),
  };
}

export function receiptKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Resolve a period label to a `Date` floor. */
export function periodToSince(period: string | undefined): Date {
  switch (period) {
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'week':
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(0);
  }
}
