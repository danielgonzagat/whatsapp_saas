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

// ============================================
// Trusted-origin helpers
// ============================================

/**
 * Decide whether an absolute URL string targets a trusted origin.
 * Trusted origins are the configured API origin and (optionally) the
 * caller-provided window origin. Non-http(s) schemes are always rejected.
 *
 * Pure function — `apiOrigin` and `windowOrigin` are passed in so callers
 * can drive this from any environment (browser, jsdom, node test runner).
 */
export function isTrustedAbsoluteRequestTarget(
  value: string,
  apiOrigin: string,
  windowOrigin?: string,
): boolean {
  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    return false;
  }

  if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') {
    return false;
  }

  if (apiOrigin && candidate.origin === apiOrigin) {
    return true;
  }

  if (windowOrigin && candidate.origin === windowOrigin) {
    return true;
  }

  return false;
}

// ============================================
// Refresh-error-code parsing
// ============================================

/**
 * Extract a refresh-token error code from a parsed JSON body, returning
 * `undefined` when the body is missing/malformed or has no `code` field.
 * Pure — does not touch the network or storage.
 */
export function parseRefreshErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const code = (body as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

// ============================================
// Refresh-token response shape helpers
// ============================================

/**
 * Pick the access token from a refresh response, tolerating both
 * `access_token` (snake) and `accessToken` (camel) wire shapes.
 */
export function pickAccessToken(data: RefreshTokenResponse): string | undefined {
  return data.access_token || data.accessToken;
}

/**
 * Pick the refresh token from a refresh response, tolerating both
 * `refresh_token` (snake) and `refreshToken` (camel) wire shapes.
 */
export function pickRefreshToken(data: RefreshTokenResponse): string | undefined {
  return data.refresh_token || data.refreshToken;
}

// ============================================
// Header merging
// ============================================

/**
 * Build the final request headers map merging caller-provided headers,
 * content-type (skipped for FormData bodies), the CSRF-mitigation
 * `X-Requested-With` marker, and optional auth + workspace headers.
 *
 * Pure — accepts token/workspaceId as inputs rather than reading storage.
 */
export function buildRequestHeaders(options: {
  headers?: HeadersInit | undefined;
  isFormData: boolean;
  token?: string | null | undefined;
  workspaceId?: string | null | undefined;
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...(options.isFormData ? {} : { 'Content-Type': 'application/json' }),
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.workspaceId) {
    headers['x-workspace-id'] = options.workspaceId;
  }
  return headers;
}
