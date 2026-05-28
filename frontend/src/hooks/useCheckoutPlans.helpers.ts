/**
 * Pure helpers extracted from {@link ./useCheckoutPlans.ts}.
 *
 * These helpers are intentionally free of React, SWR, network, and side
 * effects so they can be unit-tested in isolation and reused across other
 * hooks that consume the same checkout API shapes.
 */

/* ── Shared types (mirrored from useCheckoutPlans.ts) ── */

export interface DashboardProduct {
  id: string;
  name: string;
  slug?: string | undefined;
  description?: string | undefined;
  images?: string[] | undefined;
  category?: string | undefined;
  price?: number | undefined;
}

export interface CheckoutProductItem {
  id: string;
  slug?: string;
  name: string;
}

export interface CheckoutProductListResponse {
  products?: CheckoutProductItem[];
  data?: CheckoutProductItem[];
}

export interface CheckoutPlanShape {
  id: string;
  name: string;
  priceInCents?: number;
  quantity?: number;
  maxInstallments?: number;
  freeShipping?: boolean;
  shippingPrice?: number;
  [key: string]: unknown;
}

export interface DuplicatePlanBody {
  name: string;
  priceInCents: number | undefined;
  quantity: number | undefined;
  maxInstallments: number | undefined;
  freeShipping: boolean | undefined;
  shippingPrice: number | undefined;
}

export interface OrdersQueryParams {
  status?: string;
  page?: number;
  limit?: number;
}

export interface CheckoutProductBody {
  name: string;
  slug: string;
  description: string | undefined;
  images: string[];
  category: string | undefined;
  price: number;
}

/* ── Pure helpers ── */

/**
 * Normalize the various shapes the `GET /checkout/products` endpoint may
 * return — bare array, `{ products: [...] }` envelope, or `{ data: [...] }`
 * envelope — into a flat array. Returns an empty array on null/undefined.
 */
export function extractCheckoutProductList(
  raw: CheckoutProductItem[] | CheckoutProductListResponse | undefined,
): CheckoutProductItem[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  const envelope = raw;
  return envelope?.products || envelope?.data || [];
}

/**
 * Decide whether a checkout-product candidate matches the dashboard product
 * we want to ensure exists. Matches on slug OR name (dashboard products may
 * not always carry a slug).
 */
export function matchesProduct(
  candidate: CheckoutProductItem,
  product: Pick<DashboardProduct, 'name' | 'slug'>,
): boolean {
  return candidate.slug === product.slug || candidate.name === product.name;
}

/**
 * Build the POST body for creating a checkout-products record from a
 * dashboard product. Coerces missing slug to the product id and missing
 * price to 0, keeping the body shape stable for the API.
 */
export function buildCheckoutProductBody(product: DashboardProduct): CheckoutProductBody {
  return {
    name: product.name,
    slug: product.slug || product.id,
    description: product.description,
    images: product.images || [],
    category: product.category,
    price: product.price || 0,
  };
}

/**
 * Generic envelope unwrap used across plans/checkouts/bumps/upsells/coupons
 * /orders. Accepts either a bare array, an envelope object with the named
 * key, or undefined, and always returns an array (never null). Centralizing
 * this removes ~6 duplicated branches across the hook file.
 *
 * The input is typed as `unknown` so callers can pass any envelope shape
 * (e.g. `{ bumps?: BumpItem[] }`) without an intersection-with-index-signature
 * gymnastics — the function only ever reads `data[key]` reflectively.
 */
export function unwrapArrayOrEnvelope<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (!data || typeof data !== 'object') {
    return [];
  }
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Build the POST body for duplicating a plan. Mirrors the original plan's
 * pricing/shipping shape and appends a "(Copia)" suffix to the name.
 */
export function buildDuplicatePlanBody(plan: CheckoutPlanShape): DuplicatePlanBody {
  return {
    name: `${plan.name} (Copia)`,
    priceInCents: plan.priceInCents,
    quantity: plan.quantity,
    maxInstallments: plan.maxInstallments,
    freeShipping: plan.freeShipping,
    shippingPrice: plan.shippingPrice,
  };
}

/**
 * Build the query string for `GET /checkout/orders`, omitting any missing
 * params and producing a leading "?" only when at least one param is set.
 * Returns "" for an empty params object so callers can do
 * `\`/checkout/orders${q}\``.
 */
export function buildOrdersQueryString(params: OrdersQueryParams | undefined): string {
  if (!params) {
    return '';
  }
  const qs = new URLSearchParams();
  if (params.status) {
    qs.set('status', params.status);
  }
  if (params.page) {
    qs.set('page', String(params.page));
  }
  if (params.limit) {
    qs.set('limit', String(params.limit));
  }
  const q = qs.toString();
  return q ? `?${q}` : '';
}
