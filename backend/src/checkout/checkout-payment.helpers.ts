import { Prisma } from '@prisma/client';

/** Payment status discriminated union used by checkout payment flows. */
export type CheckoutPaymentStatus = 'APPROVED' | 'DECLINED' | 'PENDING' | 'PROCESSING' | 'CANCELED';

/** PIX display payload persisted from Mercado Pago checkout charges. */
export type PixDisplayData = {
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
};

/** Map a Stripe PaymentIntent status string to the checkout payment status. */
export function mapStripePaymentStatus(status?: string | null): CheckoutPaymentStatus {
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

/** Serialize a value to Prisma InputJsonValue, converting BigInt to string. */
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, currentValue) =>
      typeof currentValue === 'bigint' ? currentValue.toString() : currentValue,
    ),
  ) as Prisma.InputJsonValue;
}
