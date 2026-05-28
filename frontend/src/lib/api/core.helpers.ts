/**
 * Pure, side-effect-free helpers extracted from `core.ts`.
 *
 * These functions touch no module-level state, no fetch, no token storage,
 * no SWR cache. Anything here must be unit-testable without mocking.
 *
 * If you need a helper that reads `tokenStorage`, the SWR cache, or fires
 * a `BroadcastChannel`, keep it in `core.ts` — those helpers are *not*
 * pure and depend on the live runtime.
 */

// ============================================
// Shared internal response shapes
// ============================================

/** Shared API response envelope used by `apiFetch`. */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

/** Wire shape of `/auth/refresh` response (snake + camel tolerated). */
export interface RefreshTokenResponse {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
}

// ============================================
// Response envelope helpers
// ============================================

/**
 * Build a success-shaped ApiResponse. For object payloads the original
 * keys are spread alongside `data` so legacy call sites can read either
 * `response.data.foo` or `response.foo` (preserves prior behaviour).
 */
export function buildSuccessResponse<T>(payload: unknown, status: number): ApiResponse<T> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      data: payload,
      status,
    } as ApiResponse<T>;
  }

  return { data: payload as T, status };
}

/**
 * Normalize a `message` field that may be either a string or an array of
 * validation strings (NestJS class-validator returns arrays).
 */
export function normalizeErrorMessage(rawMessage: unknown): string | undefined {
  if (Array.isArray(rawMessage)) {
    return rawMessage.join(', ');
  }
  return rawMessage as string | undefined;
}

/** Build an error-shaped ApiResponse from a parsed error body. */
export function buildErrorResponse<T>(
  data: { message?: unknown; error?: string },
  status: number,
): ApiResponse<T> {
  const message = normalizeErrorMessage(data.message);
  return { error: message || data.error || `HTTP ${status}`, status };
}

// ============================================
// URL / query helpers
// ============================================

/** Build URLSearchParams skipping `undefined` entries. */
export function buildSearchParams(params: Record<string, string | undefined>): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }
  return searchParams;
}

/** Append a query string to a base URL, choosing `?` vs `&` correctly. */
export function joinQueryString(baseUrl: string, qs: string): string {
  if (!qs) {
    return baseUrl;
  }
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${qs}`;
}

/** Append a params record to a base URL, no-op when params is undefined. */
export function appendQueryParams(
  baseUrl: string,
  params?: Record<string, string | undefined>,
): string {
  if (!params) {
    return baseUrl;
  }
  return joinQueryString(baseUrl, buildSearchParams(params).toString());
}

/**
 * Format a params record as a `?a=1&b=2` string (or `''` when empty).
 * Skips `undefined`/`null` entries; coerces numbers to strings.
 */
export const buildQuery = (
  params: Record<string, string | number | undefined | null>,
): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// ============================================
// Auth header helper
// ============================================

/** Build an `authorization: Bearer <token>` header (or empty when absent). */
export const authHeaders = (token?: string): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};

// ============================================
// Body serialization helpers
// ============================================

/** Predicate: is body a raw binary payload (FormData/Blob/ArrayBuffer)? */
export function isRawBinaryBody(body: unknown): boolean {
  return body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer;
}

/** Predicate: should body be JSON.stringify'd? */
export function shouldSerializeAsJson(body: unknown): body is object {
  return Boolean(body) && typeof body === 'object' && !isRawBinaryBody(body);
}

/** Serialize an arbitrary request body to a fetch-compatible BodyInit. */
export function serializeApiBody(body: unknown): BodyInit | null {
  if (shouldSerializeAsJson(body)) {
    return JSON.stringify(body);
  }
  return (body ?? null) as BodyInit | null;
}

// ============================================
// Constants
// ============================================

/** Exponential backoff delays (ms) for retrying on 429 Too Many Requests. */
export const BACKOFF_DELAYS_MS: readonly number[] = [500, 1500, 4000];
