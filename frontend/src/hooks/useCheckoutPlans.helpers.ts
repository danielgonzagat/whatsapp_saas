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

/**
 * Partial input shape accepted by {@link buildCheckoutSeedProduct} — mirrors
 * the dashboard-side Product input which carries optional fields. Each
 * property is `| undefined` to stay compatible with
 * `exactOptionalPropertyTypes: true` callers that pass through optional
 * fields straight from another partial.
 */
export interface DashboardProductInputShape {
  id?: string | undefined;
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | undefined;
  images?: string[] | undefined;
  category?: string | undefined;
  price?: number | undefined;
}

/**
 * Minimal shape of the response returned by
 * `GET /checkout/products/:id`, used by the pure detail-unwrap helpers.
 */
export interface CheckoutProductDetailShape {
  id?: string;
  checkoutPlans?: CheckoutPlanShape[];
  plans?: CheckoutPlanShape[];
  checkoutTemplates?: Array<{ id: string; [key: string]: unknown }>;
  checkouts?: Array<{ id: string; [key: string]: unknown }>;
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

/**
 * Project the partial dashboard-side Product input into the seed shape used
 * by {@link buildCheckoutProductBody}. Returns `null` when the required
 * `id` or `name` fields are missing — callers should treat that as
 * "not enough data yet to ensure a checkout product exists".
 *
 * Extracting this from the hook lets us unit-test the gating logic
 * (id+name required) without spinning up React or SWR.
 */
export function buildCheckoutSeedProduct(
  product: DashboardProductInputShape | null | undefined,
): DashboardProduct | null {
  if (!product?.id || !product?.name) {
    return null;
  }
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    images: product.images,
    category: product.category,
    price: product.price,
  };
}

/**
 * Extract the plans array from a `GET /checkout/products/:id` response,
 * preferring the canonical `checkoutPlans` key and falling back to `plans`
 * for legacy envelopes. Returns `[]` when neither is present.
 *
 * Centralizing the dual-key fallback here pins the precedence and keeps
 * the hook body readable.
 */
export function extractPlansFromDetail(
  data: CheckoutProductDetailShape | null | undefined,
): CheckoutPlanShape[] {
  return data?.checkoutPlans || data?.plans || [];
}

/**
 * Extract the checkout templates array from a `GET /checkout/products/:id`
 * response, preferring `checkoutTemplates` over the legacy `checkouts`
 * envelope. Returns `[]` when neither is present.
 */
export function extractCheckoutsFromDetail(
  data: CheckoutProductDetailShape | null | undefined,
): Array<{ id: string; [key: string]: unknown }> {
  return data?.checkoutTemplates || data?.checkouts || [];
}

/**
 * Read the pixels array off a checkout-config response, returning `[]` when
 * the field is missing or non-array. Equivalent in behavior to the
 * original inline guard but reusable from unit tests.
 */
export function extractPixels<TPixel extends { id: string }>(
  data: { pixels?: TPixel[] } | null | undefined,
): TPixel[] {
  return Array.isArray(data?.pixels) ? data.pixels : [];
}

/**
 * Resolve the total order count: prefer the server-provided `total` (when
 * the response is an envelope), otherwise fall back to the length of the
 * unwrapped orders array. Mirrors the original `?? orders.length` guard.
 */
export function resolveOrdersTotal(
  data: { total?: number } | unknown[] | null | undefined,
  ordersLength: number,
): number {
  if (!data || Array.isArray(data)) {
    return ordersLength;
  }
  const envelope = data as { total?: number };
  return envelope.total ?? ordersLength;
}
