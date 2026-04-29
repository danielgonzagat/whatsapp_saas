export const CHECKOUT_ORDER_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELED',
  'REFUNDED',
  'CHARGEBACK',
] as const;

export type CheckoutOrderStatusValue = (typeof CHECKOUT_ORDER_STATUSES)[number];
