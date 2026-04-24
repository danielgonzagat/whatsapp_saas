import { MarketplaceTreasuryLedgerKind, Prisma, type ConnectAccountType } from '@prisma/client';
import type { SplitRole } from '../payments/split/split.types';

export const D_RE = /\D/g;

/**
 * Request shape seen by payment webhook endpoints. The raw body is required for
 * HMAC/Stripe signature verification and is populated by the global body parser
 * configured in main.ts.
 */
export interface WebhookRequest {
  body?: unknown;
  rawBody?: string | Buffer;
  url?: string;
}

/**
 * Generic payment webhook body accepted by the default `/webhook/payment`
 * endpoint.
 */
export interface GenericPaymentWebhookBody {
  workspaceId?: string;
  contactId?: string;
  phone?: string;
  status?: string;
  amount?: number;
  orderId?: string;
  provider?: string;
  [key: string]: unknown;
}

/** Shopify order webhook — only the fields the controller actually reads. */
export interface ShopifyOrderWebhookBody {
  id?: string | number;
  order_number?: string | number;
  financial_status?: string;
  workspaceId?: string;
  phone?: string;
  total_price?: string;
  total_price_set?: { shop_money?: { amount?: string | number } };
  currency?: string;
  presentment_currency?: string;
  customer?: { phone?: string };
}

/** PagHiper webhook — only the fields the controller actually reads. */
export interface PagHiperWebhookBody {
  status?: string;
  workspaceId?: string;
  value?: number;
  value_cents?: number;
  transaction_id?: string;
  payer_phone?: string;
  payer?: { phone?: string };
  metadata?: { workspaceId?: string };
  transaction?: {
    status?: string;
    transaction_id?: string;
    payer_phone?: string;
    payer?: { phone?: string };
    metadata?: { workspaceId?: string };
  };
}

/** WooCommerce order webhook — only the fields the controller actually reads. */
export interface WooCommerceMetaData {
  key: string;
  value: unknown;
}
export interface WooCommerceWebhookBody {
  id?: string | number;
  number?: string | number;
  status?: string;
  total?: string;
  currency?: string;
  workspaceId?: string;
  phone?: string;
  billing?: { phone?: string };
  customer?: { phone?: string };
  meta_data?: WooCommerceMetaData[];
}

/** Stripe checkout session shape as consumed by this controller. */
export interface StripeCheckoutSessionLike {
  id?: string;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  customer_email?: string | null;
  customer_details?: {
    email?: string | null;
    phone?: string | null;
  } | null;
  metadata?: {
    workspaceId?: string;
    phone?: string;
    productName?: string;
    [key: string]: string | undefined;
  } | null;
}
export interface StripePaymentIntentLike {
  id?: string;
  status?: string | null;
  currency?: string | null;
  latest_charge?: string | null;
  transfer_group?: string | null;
  metadata?: {
    workspaceId?: string;
    workspace_id?: string;
    kloel_order_id?: string;
    orderId?: string;
    [key: string]: string | undefined;
  } | null;
  next_action?: {
    type?: string | null;
    pix_display_qr_code?: {
      data?: string | null;
      image_url_png?: string | null;
      expires_at?: number | null;
    } | null;
  } | null;
  last_payment_error?: {
    message?: string | null;
  } | null;
}
export interface StripeEventLike {
  id?: string;
  type?: string;
  data?: {
    object?: StripeCheckoutSessionLike | StripePaymentIntentLike;
  };
}

export const ROLE_TO_ACCOUNT_TYPE: Record<SplitRole, ConnectAccountType> = {
  supplier: 'SUPPLIER',
  affiliate: 'AFFILIATE',
  coproducer: 'COPRODUCER',
  manager: 'MANAGER',
  seller: 'SELLER',
};

export const FINANCIAL_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

export type CheckoutIntentStatus = 'APPROVED' | 'DECLINED' | 'PENDING' | 'PROCESSING' | 'CANCELED';

export const STRIPE_INTENT_STATUS_MAP: Array<{
  event?: string;
  status?: string;
  result: CheckoutIntentStatus;
}> = [
  { event: 'payment_intent.succeeded', status: 'succeeded', result: 'APPROVED' },
  { event: 'payment_intent.payment_failed', result: 'DECLINED' },
  { event: 'payment_intent.processing', status: 'processing', result: 'PROCESSING' },
  { event: 'payment_intent.canceled', status: 'canceled', result: 'CANCELED' },
];

/** Maps a Stripe event type + intent status to a CheckoutIntentStatus. */
export function mapStripeIntentStatusForCheckout(
  eventType?: string,
  intentStatus?: string,
): CheckoutIntentStatus {
  const event = String(eventType || '').toLowerCase();
  const status = String(intentStatus || '').toLowerCase();

  for (const rule of STRIPE_INTENT_STATUS_MAP) {
    const eventMatches = rule.event !== undefined && event === rule.event;
    const statusMatches = rule.status !== undefined && status === rule.status;
    if (eventMatches || statusMatches) {
      return rule.result;
    }
  }
  return 'PENDING';
}

/** Casts unknown to Record or null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Casts unknown to non-empty string or null. */
export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Casts unknown to string[]. */
export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** Parses an integer-like value to bigint, returning 0n on failure. */
export function parseBigIntNumberish(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  return 0n;
}

/** Marketplace treasury ledger kind for reversals. */
export { MarketplaceTreasuryLedgerKind };
