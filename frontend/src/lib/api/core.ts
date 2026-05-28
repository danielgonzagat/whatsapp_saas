import { mutate } from 'swr';
import { API_BASE } from '../http';
import { tokenStorage, resolveWorkspaceFromAuthPayload } from './core-tokens';
import { REFRESH_TOKEN_ERROR_CODES } from './auth-errors';
import {
  BACKOFF_DELAYS_MS,
  appendQueryParams,
  authHeaders,
  buildErrorResponse,
  buildQuery,
  buildSuccessResponse,
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
  /** Qr code property. */
  qrCode?: string | undefined;
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
  /** Qr available property. */
  qrAvailable?: boolean | undefined;
  /** Browser session status property. */
  browserSessionStatus?: string | undefined;
  /** Screencast status property. */
  screencastStatus?: string | undefined;
  /** Viewer available property. */
  viewerAvailable?: boolean | undefined;
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
  /** Viewport property. */
  viewport?: {
    width: number;
    height: number;
  } | undefined;
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
  /** Qr code property. */
  qrCode?: string | undefined;
  /** Qr code image property. */
  qrCodeImage?: string | undefined;
  /** Error property. */
  error?: boolean | undefined;
}

/** Whats app screencast token response shape. */
export interface WhatsAppScreencastTokenResponse {
  /** Token property. */
  token: string;
  /** Expires at property. */
  expiresAt: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Require token property. */
  requireToken?: boolean | undefined;
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

// Cross-tab auth coordination: winning tab announces successful
// refreshes via BroadcastChannel so losing tabs can re-read cookies.
const AUTH_CHANNEL =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('kloel-auth')
    : null;

function announceAuthRefresh(): void {
  if (AUTH_CHANNEL) {
    try {
      AUTH_CHANNEL.postMessage({ type: 'tokens-refreshed' });
    } catch {
      /* postMessage may throw in sandboxed environments */
    }
  }
}

if (AUTH_CHANNEL) {
  AUTH_CHANNEL.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'tokens-refreshed') {
      // Proactive reconciliation — snapshot-compare-clear in
      // doRefreshAccessToken also handles this defensively.
    }
  });
}

async function refreshAccessToken(): Promise<boolean> {
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
        errorCode = (errorBody as Record<string, unknown>)?.code as string | undefined;
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
    const newToken = data.access_token || data.accessToken;
    const newRefresh = data.refresh_token || data.refreshToken;
    if (newToken) {
      tokenStorage.setToken(newToken);
      if (newRefresh) {
        tokenStorage.setRefreshToken(newRefresh);
      }

      // Announce success to other tabs via BroadcastChannel
      announceAuthRefresh();

      return true;
    }

    return false;
  } catch {
    // Snapshot-compare-clear on network error too
    const currentRefresh = tokenStorage.getRefreshToken();
    if (currentRefresh && currentRefresh !== refreshToken) {
      return true;
    }
    tokenStorage.clear();
    return false;
  }
}

function resolveApiEndpoint(endpoint: string): string {
  return endpoint;
}

function isTrustedAbsoluteRequestTarget(value: string): boolean {
  try {
    const candidate = new URL(value);
    if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') {
      return false;
    }

    if (API_ORIGIN && candidate.origin === API_ORIGIN) {
      return true;
    }

    if (typeof window !== 'undefined' && candidate.origin === window.location.origin) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function createTrustedRequest(input: string, init?: RequestInit): Request {
  if (input.startsWith('/')) {
    const sameOriginBase =
      (typeof window !== 'undefined' && window.location.origin) || API_ORIGIN || 'http://localhost';
    return new Request(new URL(input, `${sameOriginBase}/`), init);
  }

  if (!isTrustedAbsoluteRequestTarget(input)) {
    throw new Error(`Blocked external request target: ${input}`);
  }

  return new Request(input, init);
}

function buildApiHeaders(options: {
  headers?: HeadersInit;
  body?: unknown;
}): Record<string, string> {
  const isFormData = options.body instanceof FormData;
  const token = tokenStorage.getToken();
  const workspaceId = tokenStorage.getWorkspaceId();

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    // CSRF mitigation: custom header prevents cross-origin form submissions
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }
  return headers;
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

/** Api fetch. */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: Omit<RequestInit, 'body'> & {
    body?: unknown;
    params?: Record<string, string | undefined>;
  } = {},
): Promise<ApiResponse<T>> {
  const resolvedEndpoint = resolveApiEndpoint(endpoint);
  const headers = buildApiHeaders(options);
  const url = appendQueryParams(`${API_URL}${resolvedEndpoint}`, options.params);
  const body = serializeApiBody(options.body);
  const baseInit: RequestInit = {
    ...options,
    credentials: 'include',
    body: body ?? null,
    headers,
  };

  try {
    let response = await performApiRequest<T>(url, baseInit);

    if (response.status === 429) {
      response = await retryAfterBackoff<T>(url, baseInit, response);
    }

    if (response.status === 401 && tokenStorage.getRefreshToken()) {
      const retryResponse = await retryApiRequestWithRefreshedToken<T>(url, baseInit, headers);
      if (retryResponse) {
        return retryResponse;
      }
    }

    return response;
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Network error',
      status: 0,
    };
  }
}

// ============================================
// Generic API client
// ============================================

export const api = {
  async get<T = unknown>(endpoint: string): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(createTrustedRequest(endpoint));
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
    }

    const res = await apiFetch<T>(endpoint, { method: 'GET' });
    if (res.error) {
      throw new Error(res.error);
    }
    return { data: res.data as T };
  },

  async post<T = unknown>(endpoint: string, body?: unknown): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(
        createTrustedRequest(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : null,
        }),
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
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
    if (endpoint.startsWith('http')) {
      const res = await fetch(
        createTrustedRequest(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : null,
        }),
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
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
    if (endpoint.startsWith('http')) {
      const res = await fetch(createTrustedRequest(endpoint, { method: 'DELETE' }));
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
    }

    const res = await apiFetch<T>(endpoint, { method: 'DELETE' });
    if (res.error) {
      throw new Error(res.error);
    }
    return { data: res.data as T };
  },
};
