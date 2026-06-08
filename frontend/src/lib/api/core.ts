import { mutate } from 'swr';
import { API_BASE } from '../http';
import { isKloelJwtExpired } from '../auth-identity';
import { tokenStorage, resolveWorkspaceFromAuthPayload } from './core-tokens';
import { REFRESH_TOKEN_ERROR_CODES } from './auth-errors';
import {
  BACKOFF_DELAYS_MS,
  appendQueryParams,
  authHeaders,
  buildAbsoluteRequestInit,
  buildErrorResponse,
  buildQuery,
  buildRequestHeaders,
  buildSuccessResponse,
  extractFetchErrorMessage,
  isAbsoluteHttpEndpoint,
  isTrustedAbsoluteRequestTarget,
  parseRefreshErrorCode,
  pickAccessToken,
  pickRefreshToken,
  serializeApiBody,
  type ApiResponse,
  type RefreshTokenResponse,
} from './core.helpers';

export { tokenStorage, resolveWorkspaceFromAuthPayload };
export { buildQuery, authHeaders };

/** Invalidate SWR cache keys matching a prefix after a write operation */
export function invalidateCache(prefix: string) {
  mutate((key: unknown) => typeof key === 'string' && key.startsWith(prefix));
}

/** Whats app channel session status shape. */
export interface WhatsAppConnectionStatus {
  /** Connected property. */
  connected: boolean;
  /** Status property. */
  status?: string | undefined;
  /** Phone property. */
  phone?: string | undefined;
  /** Push name property. */
  pushName?: string | undefined;
  /** Auth url property. */
  authUrl?: string | undefined;
  /** Phone number id property. */
  phoneNumberId?: string | undefined;
  /** Whatsapp business id property. */
  whatsappBusinessId?: string | null | undefined;
  /** Message property. */
  message?: string | undefined;
  /** Provider property. */
  provider?: string | undefined;
  /** Worker available property. */
  workerAvailable?: boolean | undefined;
  /** Worker healthy property. */
  workerHealthy?: boolean | undefined;
  /** Worker error property. */
  workerError?: string | null | undefined;
  /** Degraded property. */
  degraded?: boolean | undefined;
  /** Takeover active property. */
  takeoverActive?: boolean | undefined;
  /** Agent paused property. */
  agentPaused?: boolean | undefined;
  /** Last observation at property. */
  lastObservationAt?: string | null | undefined;
  /** Last action at property. */
  lastActionAt?: string | null | undefined;
  /** Observation summary property. */
  observationSummary?: string | null | undefined;
  /** Active provider property. */
  activeProvider?: string | null | undefined;
  /** Proof count property. */
  proofCount?: number | undefined;
  /** Degraded reason property. */
  degradedReason?: string | null | undefined;
}

/** Whats app proof entry shape. */
export interface WhatsAppProofEntry {
  /** Id property. */
  id: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Kind property. */
  kind: string;
  /** Provider property. */
  provider: string;
  /** Summary property. */
  summary: string;
  /** Objective property. */
  objective?: string | null;
  /** Before image property. */
  beforeImage?: string | null;
  /** After image property. */
  afterImage?: string | null;
  /** Action property. */
  action?: Record<string, unknown>;
  /** Observation property. */
  observation?: Record<string, unknown>;
  /** Metadata property. */
  metadata?: Record<string, unknown> | null;
  /** Created at property. */
  createdAt: string;
}

/** Whats app connect response shape. */
export interface WhatsAppConnectResponse {
  /** Status property. */
  status: string;
  /** Message property. */
  message?: string | undefined;
  /** Auth url property. */
  authUrl?: string | undefined;
  /** Error property. */
  error?: boolean | undefined;
}


export interface WhatsAppProofEntry {
  /** Id property. */
  id: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Kind property. */
  kind: string;
  /** Provider property. */
  provider: string;
  /** Summary property. */
  summary: string;
  /** Objective property. */
  objective?: string | null | undefined;
  /** Before image property. */
  beforeImage?: string | null | undefined;
  /** After image property. */
  afterImage?: string | null | undefined;
  /** Action property. */
  action?: Record<string, unknown> | undefined;
  /** Observation property. */
  observation?: Record<string, unknown> | undefined;
  /** Metadata property. */
  metadata?: Record<string, unknown> | null | undefined;
  /** Created at property. */
  createdAt: string;
}

// ============================================
// apiFetch - Base fetch with auth headers
// ============================================

const API_URL = API_BASE;
const API_ORIGIN = API_URL ? new URL(API_URL).origin : '';

// Mutex to prevent concurrent refresh attempts (race condition on polling pages)
let refreshPromise: Promise<boolean> | null = null;
const API_READ_DEDUPLICATION_TTL_MS = 1000;
let apiReadDeduplicationFetchReference: typeof globalThis.fetch | null = null;
const inFlightApiReads = new Map<string, Promise<ApiResponse<unknown>>>();
const recentApiReadResponses = new Map<
  string,
  { response: ApiResponse<unknown>; expiresAt: number }
>();
let apiReadFetchIdentity: typeof globalThis.fetch | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in-flight, wait for its result instead of starting a new one
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = doRefreshAccessToken();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function ensureFreshAccessToken(): Promise<boolean> {
  const token = tokenStorage.getToken();
  const refreshToken = tokenStorage.getRefreshToken();
  if (!isKloelJwtExpired(token) || !refreshToken) {
    return false;
  }

  return refreshAccessToken();
}

async function doRefreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      // Snapshot-compare-clear: if another tab won the race and
      // wrote fresh cookies while we were in-flight, skip the clear.
      const currentRefresh = tokenStorage.getRefreshToken();
      if (currentRefresh && currentRefresh !== refreshToken) {
        return true; // winning tab already persisted new tokens
      }

      // Parse PI-μ error code for differentiated recovery
      let errorCode: string | undefined;
      try {
        const errorBody = await res.json();
        errorCode = parseRefreshErrorCode(errorBody);
      } catch {
        /* ignore parse errors */
      }

      switch (errorCode) {
        case REFRESH_TOKEN_ERROR_CODES.RACE_LOST:
          // Another process claimed the token first. Re-read from
          // cookies in case the winner already wrote fresh tokens.
          if (tokenStorage.getToken()) {
            return true;
          }
          return false;

        case REFRESH_TOKEN_ERROR_CODES.ISSUANCE_FAILED:
          // Transient server error — caller should retry with backoff.
          return false;

        case REFRESH_TOKEN_ERROR_CODES.REPLAYED:
          // Security event — log and clear.
          console.error('[auth] Security: refresh token replay detected');
          tokenStorage.clear();
          return false;

        case REFRESH_TOKEN_ERROR_CODES.UNKNOWN:
        case REFRESH_TOKEN_ERROR_CODES.AGENT_MISSING:
        case REFRESH_TOKEN_ERROR_CODES.EXPIRED:
        default:
          tokenStorage.clear();
          return false;
      }
    }

    const data: RefreshTokenResponse = await res.json();
    const newToken = pickAccessToken(data);
    const newRefresh = pickRefreshToken(data);
    if (newToken) {
      tokenStorage.setToken(newToken);
      if (newRefresh) {
        tokenStorage.setRefreshToken(newRefresh);
      }
      return true;
    }

    return false;
  } catch {
    // Transient failure (network down, timeout, /auth/refresh unreachable).
    // Do NOT clear the session — the still-valid access token can finish the
    // current request, and a later attempt can refresh once the network
    // recovers. Only explicit auth rejections (handled in the !res.ok branch
    // above) clear credentials.
    return false;
  }
}

function resolveApiEndpoint(endpoint: string): string {
  return endpoint;
}

function currentWindowOrigin(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined;
}

function createTrustedRequest(input: string, init?: RequestInit): Request {
  if (input.startsWith('/')) {
    const sameOriginBase = currentWindowOrigin() || API_ORIGIN || 'http://localhost';
    return new Request(new URL(input, `${sameOriginBase}/`), init);
  }

  if (!isTrustedAbsoluteRequestTarget(input, API_ORIGIN, currentWindowOrigin())) {
    throw new Error(`Blocked external request target: ${input}`);
  }

  return new Request(input, init);
}

function buildApiHeaders(options: {
  headers?: HeadersInit;
  body?: unknown;
}): Record<string, string> {
  return buildRequestHeaders({
    headers: options.headers,
    isFormData: options.body instanceof FormData,
    token: tokenStorage.getToken(),
    workspaceId: tokenStorage.getWorkspaceId(),
  });
}

async function performApiRequest<T>(url: string, init: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(createTrustedRequest(url, init));
  const data: unknown = await res.json().catch(() => ({} as unknown));
  if (!res.ok) {
    return buildErrorResponse<T>(
      data as { message?: unknown; error?: string },
      res.status,
    );
  }
  return buildSuccessResponse<T>(data, res.status);
}

async function retryApiRequestWithRefreshedToken<T>(
  url: string,
  baseInit: RequestInit,
  headers: Record<string, string>,
): Promise<ApiResponse<T> | null> {
  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    return null;
  }
  headers.Authorization = `Bearer ${tokenStorage.getToken()}`;
  return performApiRequest<T>(url, { ...baseInit, headers });
}

async function retryAfterBackoff<T>(
  url: string,
  baseInit: RequestInit,
  firstResponse: ApiResponse<T>,
): Promise<ApiResponse<T>> {
  let last = firstResponse;

  for (let attempt = 0; attempt < BACKOFF_DELAYS_MS.length; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, BACKOFF_DELAYS_MS[attempt]));

    // Re-read auth header — another tab may have refreshed tokens
    const token = tokenStorage.getToken();
    const headers: Record<string, string> = {
      ...(baseInit.headers as Record<string, string>),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await performApiRequest<T>(url, { ...baseInit, headers });

    if (response.status !== 429) {
      return response;
    }
    last = response;
  }

  return last;
}

function resolveApiMethod(init: RequestInit): string {
  return String(init.method || 'GET').toUpperCase();
}

function shouldDeduplicateApiRead(init: RequestInit): boolean {
  const method = resolveApiMethod(init);
  return (method === 'GET' || method === 'HEAD') && !init.body && !init.signal;
}

function isMutatingApiRequest(init: RequestInit): boolean {
  const method = resolveApiMethod(init);
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function buildApiReadDeduplicationKey(url: string, headers: Record<string, string>): string {
  const normalizedHeaders = Array.from(new Headers(headers).entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify([url, normalizedHeaders]);
}

function getRecentApiReadResponse<T>(key: string): ApiResponse<T> | null {
  const entry = recentApiReadResponses.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    recentApiReadResponses.delete(key);
    return null;
  }

  return entry.response as ApiResponse<T>;
}

function rememberApiReadResponse<T>(key: string, response: ApiResponse<T>): void {
  if (response.error || response.status < 200 || response.status >= 400) {
    return;
  }

  recentApiReadResponses.set(key, {
    response: response as ApiResponse<unknown>,
    expiresAt: Date.now() + API_READ_DEDUPLICATION_TTL_MS,
  });
}

function clearApiReadDeduplicationMemory(): void {
  inFlightApiReads.clear();
  recentApiReadResponses.clear();
}
function clearApiReadDeduplicationMemoryIfFetchChanged(): void {
  if (apiReadDeduplicationFetchReference === globalThis.fetch) {
    return;
  }

  apiReadDeduplicationFetchReference = globalThis.fetch;
  clearApiReadDeduplicationMemory();
}


function clearApiReadDeduplicationMemoryWhenFetchChanges(): void {
  const currentFetch = globalThis.fetch;
  if (apiReadFetchIdentity === currentFetch) {
    return;
  }
  clearApiReadDeduplicationMemory();
  apiReadFetchIdentity = currentFetch;
}

async function executeApiFetchRequest<T>(
  url: string,
  baseInit: RequestInit,
  headers: Record<string, string>,
): Promise<ApiResponse<T>> {
  try {
    const response = await performApiRequest<T>(url, baseInit);

    if (response.status === 401 && tokenStorage.getRefreshToken()) {
      const retryResponse = await retryApiRequestWithRefreshedToken<T>(url, baseInit, headers);
      if (retryResponse) {
        return retryResponse;
      }
    }

    if (response.status === 429) {
      return retryAfterBackoff<T>(url, baseInit, response);
    }

    return response;
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Network error',
      status: 0,
    };
  }
}

function performDeduplicatedApiRead<T>(
  url: string,
  baseInit: RequestInit,
  headers: Record<string, string>,
): Promise<ApiResponse<T>> {
  clearApiReadDeduplicationMemoryWhenFetchChanges();
  const key = buildApiReadDeduplicationKey(url, headers);
  const recent = getRecentApiReadResponse<T>(key);
  if (recent) {
    return Promise.resolve(recent);
  }

  const existing = inFlightApiReads.get(key);
  if (existing) {
    return existing as Promise<ApiResponse<T>>;
  }

  const promise = executeApiFetchRequest<T>(url, baseInit, headers)
    .then((response) => {
      rememberApiReadResponse(key, response);
      return response;
    })
    .finally(() => {
      if (inFlightApiReads.get(key) === promise) {
        inFlightApiReads.delete(key);
      }
    });
  inFlightApiReads.set(key, promise as Promise<ApiResponse<unknown>>);
  return promise;
}

/** Api fetch. */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: Omit<RequestInit, 'body'> & {
    body?: unknown;
    params?: Record<string, string | undefined>;
  } = {},
): Promise<ApiResponse<T>> {
  const resolvedEndpoint = resolveApiEndpoint(endpoint);
  clearApiReadDeduplicationMemoryIfFetchChanged();
  await ensureFreshAccessToken();

  const headers = buildApiHeaders(options);
  const url = appendQueryParams(`${API_URL}${resolvedEndpoint}`, options.params);
  const body = serializeApiBody(options.body);
  const baseInit: RequestInit = {
    ...options,
    cache: options.cache ?? 'no-store',
    credentials: 'include',
    body: body ?? null,
    headers,
  };

  if (shouldDeduplicateApiRead(baseInit)) {
    return performDeduplicatedApiRead<T>(url, baseInit, headers);
  }

  if (isMutatingApiRequest(baseInit)) {
    clearApiReadDeduplicationMemory();
  }

  return executeApiFetchRequest<T>(url, baseInit, headers);
}

// ============================================
// Generic API client
// ============================================

async function fetchAbsoluteJson<T>(
  endpoint: string,
  init?: RequestInit,
): Promise<{ data: T }> {
  const res = await fetch(createTrustedRequest(endpoint, init));
  if (!res.ok) {
    const parsed = await res.json().catch(() => null);
    throw new Error(extractFetchErrorMessage(parsed, res.statusText));
  }
  const data = await res.json();
  return { data };
}

export const api = {
  async get<T = unknown>(endpoint: string): Promise<{ data: T }> {
    if (isAbsoluteHttpEndpoint(endpoint)) {
      return fetchAbsoluteJson<T>(endpoint);
    }

    const res = await apiFetch<T>(endpoint, { method: 'GET' });
    if (res.error) {
      throw new Error(res.error);
    }
    return { data: res.data as T };
  },

  async post<T = unknown>(endpoint: string, body?: unknown): Promise<{ data: T }> {
    if (isAbsoluteHttpEndpoint(endpoint)) {
      return fetchAbsoluteJson<T>(endpoint, buildAbsoluteRequestInit('POST', body));
    }

    const res = await apiFetch<T>(endpoint, {
      method: 'POST',
      body: body,
    });
    if (res.error) {
      throw new Error(res.error);
    }
    return { data: res.data as T };
  },

  async put<T = unknown>(endpoint: string, body?: unknown): Promise<{ data: T }> {
    if (isAbsoluteHttpEndpoint(endpoint)) {
      return fetchAbsoluteJson<T>(endpoint, buildAbsoluteRequestInit('PUT', body));
    }

    const res = await apiFetch<T>(endpoint, {
      method: 'PUT',
      body: body,
    });
    if (res.error) {
      throw new Error(res.error);
    }
    return { data: res.data as T };
  },

  async delete<T = unknown>(endpoint: string): Promise<{ data: T }> {
    if (isAbsoluteHttpEndpoint(endpoint)) {
      return fetchAbsoluteJson<T>(endpoint, { method: 'DELETE' });
    }

    const res = await apiFetch<T>(endpoint, { method: 'DELETE' });
    if (res.error) {
      throw new Error(res.error);
    }
    return { data: res.data as T };
  },
};
