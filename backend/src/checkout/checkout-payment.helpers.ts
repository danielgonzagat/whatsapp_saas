import { Prisma } from '@prisma/client';

/** Payment status discriminated union used by checkout payment flows. */
export type CheckoutPaymentStatus =
  | 'APPROVED'
  | 'DECLINED'
  | 'PENDING'
  | 'PROCESSING'
  | 'CANCELED';

/** PIX display payload extracted from Stripe PaymentIntent next_action. */
export type PixDisplayData = {
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
};

/** Map a Stripe PaymentIntent status string to the checkout payment status. */
export function mapStripePaymentStatus(
  status?: string | null,
): CheckoutPaymentStatus {
  switch (String(status || '').toLowerCase()) {
    case 'succeeded':
      return 'APPROVED';
    case 'processing':
      return 'PROCESSING';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}

/** Extract PIX display data from a Stripe PaymentIntent next_action payload. */
export function extractPixDisplayData(paymentIntent: {
  next_action?: {
    type?: string | null;
    pix_display_qr_code?: {
      data?: string | null;
      image_url_png?: string | null;
      expires_at?: number | null;
    } | null;
  } | null;
}): PixDisplayData {
  const nextAction = paymentIntent.next_action;
  const pixAction =
    nextAction?.type === 'pix_display_qr_code'
      ? nextAction.pix_display_qr_code
      : null;

  return {
    pixQrCode: pixAction?.image_url_png || null,
    pixCopyPaste: pixAction?.data || null,
    pixExpiresAt:
      typeof pixAction?.expires_at === 'number'
        ? new Date(pixAction.expires_at * 1000).toISOString()
        : null,
  };
}

/** Serialize a value to Prisma InputJsonValue, converting BigInt to string. */
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, currentValue) =>
      typeof currentValue === 'bigint'
        ? currentValue.toString()
        : currentValue,
    ),
  ) as Prisma.InputJsonValue;
}
