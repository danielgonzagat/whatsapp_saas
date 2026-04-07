// API Client for KLOEL Backend - Core module
// Types, token storage, apiFetch, wallet & memory functions
import { mutate } from 'swr';
import { API_BASE } from '../http';
import { getSharedCookieDomain } from '@/lib/subdomains';

/** Invalidate SWR cache keys matching a prefix after a write operation */
export function invalidateCache(prefix: string) {
  mutate((key: unknown) => typeof key === 'string' && key.startsWith(prefix));
}

// ============================================
// Types
// ============================================

export interface WalletBalance {
  available: number;
  pending: number;
  blocked: number;
  total: number;
  formattedAvailable: string;
  formattedPending: string;
  formattedTotal: string;
}

export interface WalletTransaction {
  id: string;
  type: 'sale' | 'withdrawal' | 'refund' | 'fee';
  amount: number;
  grossAmount?: number;
  gatewayFee?: number;
  kloelFee?: number;
  netAmount?: number;
  status: 'pending' | 'confirmed' | 'failed';
  description?: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  key: string;
  value: any;
  type: string;
  createdAt: string;
  embedding?: number[];
}

export interface Product {
  name: string;
  price: number;
  description?: string;
}

export interface Lead {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  status: string;
  lastIntent?: string;
  lastInteraction?: string;
  totalMessages?: number;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  status?: string;
  phone?: string;
  pushName?: string;
  authUrl?: string;
  phoneNumberId?: string;
  whatsappBusinessId?: string | null;
  qrCode?: string;
  message?: string;
  provider?: string;
  workerAvailable?: boolean;
  workerHealthy?: boolean;
  workerError?: string | null;
  degraded?: boolean;
  qrAvailable?: boolean;
  browserSessionStatus?: string;
  screencastStatus?: string;
  viewerAvailable?: boolean;
  takeoverActive?: boolean;
  agentPaused?: boolean;
  lastObservationAt?: string | null;
  lastActionAt?: string | null;
  observationSummary?: string | null;
  activeProvider?: string | null;
  proofCount?: number;
  degradedReason?: string | null;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface WhatsAppProofEntry {
  id: string;
  workspaceId: string;
  kind: string;
  provider: string;
  summary: string;
  objective?: string | null;
  beforeImage?: string | null;
  afterImage?: string | null;
  action?: any;
  observation?: any;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface WhatsAppConnectResponse {
  status: string;
  message?: string;
  authUrl?: string;
  qrCode?: string;
  qrCodeImage?: string;
  error?: boolean;
}

export interface WhatsAppScreencastTokenResponse {
  token: string;
  expiresAt: string;
  workspaceId: string;
  requireToken?: boolean;
}

// ============================================
// Internal types
// ============================================

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

function buildSuccessResponse<T>(payload: T, status: number): ApiResponse<T> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, any>),
      data: payload,
      status,
    } as ApiResponse<T>;
  }

  return { data: payload, status };
}

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

// ============================================
// Storage keys & helpers
// ============================================

const TOKEN_KEY = 'kloel_access_token';
const REFRESH_TOKEN_KEY = 'kloel_refresh_token';
const WORKSPACE_KEY = 'kloel_workspace_id';
const AUTH_COOKIE_KEY = 'kloel_auth';
const LEGACY_TOKEN_COOKIE_KEY = 'kloel_token';
const STORAGE_EVENT = 'kloel-storage-changed';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function emitStorageChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));

  if (!cookie) return null;
  return decodeURIComponent(cookie.slice(prefix.length));
}

function browserCookieSuffix(maxAge: number) {
  const parts = [`path=/`, `max-age=${maxAge}`, 'SameSite=Lax'];
  const domain =
    typeof window !== 'undefined' ? getSharedCookieDomain(window.location.host) : undefined;

  if (domain) {
    parts.push(`domain=${domain}`);
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function setBrowserCookie(name: string, value: string, maxAge = AUTH_COOKIE_MAX_AGE) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; ${browserCookieSuffix(maxAge)}`;
}

function clearBrowserCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; ${browserCookieSuffix(0)}`;
}

function setBrowserAuthCookie() {
  setBrowserCookie(AUTH_COOKIE_KEY, '1');
}

function clearBrowserAuthCookies() {
  for (const name of [
    AUTH_COOKIE_KEY,
    LEGACY_TOKEN_COOKIE_KEY,
    TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    WORKSPACE_KEY,
  ]) {
    clearBrowserCookie(name);
  }
}

function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function syncWorkspaceFromToken(): string | null {
  if (typeof window === 'undefined') return null;

  const token =
    localStorage.getItem(TOKEN_KEY) ||
    readBrowserCookie(TOKEN_KEY) ||
    readBrowserCookie(LEGACY_TOKEN_COOKIE_KEY);

  const payload = decodeJwtPayload(token);
  const tokenWorkspaceId = String(payload?.workspaceId || '').trim();
  const currentWorkspaceId = localStorage.getItem(WORKSPACE_KEY);

  if (!tokenWorkspaceId) {
    return currentWorkspaceId;
  }

  if (currentWorkspaceId !== tokenWorkspaceId) {
    localStorage.setItem(WORKSPACE_KEY, tokenWorkspaceId);
    setBrowserCookie(WORKSPACE_KEY, tokenWorkspaceId);
    emitStorageChange();
  } else if (readBrowserCookie(WORKSPACE_KEY) !== tokenWorkspaceId) {
    setBrowserCookie(WORKSPACE_KEY, tokenWorkspaceId);
  }

  return tokenWorkspaceId;
}

function syncBrowserStorageFromCookies(options?: { clearLocalIfMissing?: boolean }): boolean {
  if (typeof window === 'undefined') return false;

  const accessToken = readBrowserCookie(TOKEN_KEY) || readBrowserCookie(LEGACY_TOKEN_COOKIE_KEY);
  const refreshToken = readBrowserCookie(REFRESH_TOKEN_KEY);
  const workspaceId = readBrowserCookie(WORKSPACE_KEY);
  const hasSharedSession = Boolean(readBrowserCookie(AUTH_COOKIE_KEY) || accessToken);
  let changed = false;

  const syncKey = (key: string, value: string | null) => {
    const currentValue = localStorage.getItem(key);

    if (value) {
      if (currentValue !== value) {
        localStorage.setItem(key, value);
        changed = true;
      }
      return;
    }

    if (currentValue !== null) {
      localStorage.removeItem(key);
      changed = true;
    }
  };

  if (!hasSharedSession) {
    if (options?.clearLocalIfMissing) {
      syncKey(TOKEN_KEY, null);
      syncKey(REFRESH_TOKEN_KEY, null);
      syncKey(WORKSPACE_KEY, null);
      clearBrowserAuthCookies();

      if (changed) {
        emitStorageChange();
      }
    }

    return false;
  }

  syncKey(TOKEN_KEY, accessToken);
  syncKey(REFRESH_TOKEN_KEY, refreshToken);
  syncKey(WORKSPACE_KEY, workspaceId);

  if (accessToken && !readBrowserCookie(AUTH_COOKIE_KEY)) {
    setBrowserAuthCookie();
  }

  if (changed) {
    emitStorageChange();
  }

  return Boolean(accessToken);
}

export function resolveWorkspaceFromAuthPayload(payload: any): {
  id: string;
  name?: string;
} | null {
  const explicitWorkspace = payload?.workspace;
  if (explicitWorkspace?.id) {
    return explicitWorkspace;
  }

  const explicitWorkspaceId = String(payload?.user?.workspaceId || '').trim();
  const workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces : [];

  if (explicitWorkspaceId) {
    const matchedWorkspace = workspaces.find((workspace: any) => {
      return String(workspace?.id || '').trim() === explicitWorkspaceId;
    });

    if (matchedWorkspace?.id) {
      return matchedWorkspace;
    }

    return {
      id: explicitWorkspaceId,
      name: payload?.user?.workspaceName || 'Workspace',
    };
  }

  const firstWorkspace = workspaces[0];
  if (firstWorkspace?.id) {
    return firstWorkspace;
  }

  return null;
}

// Token management
// Security note: Tokens stored in localStorage for SPA compatibility.
// For higher security, migrate to httpOnly cookies with CSRF protection.
// Current approach is standard for SPAs but vulnerable to XSS.
export const tokenStorage = {
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    // Do NOT clear localStorage if cookie is missing — the cookie may have expired
    // while localStorage still has a valid token. Let the 401 handler deal with it.
    syncBrowserStorageFromCookies({ clearLocalIfMissing: false });
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
    setBrowserCookie(TOKEN_KEY, token);
    setBrowserAuthCookie();
    emitStorageChange();
  },

  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    syncBrowserStorageFromCookies();
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setRefreshToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
    setBrowserCookie(REFRESH_TOKEN_KEY, token);
    emitStorageChange();
  },

  getWorkspaceId: (): string | null => {
    if (typeof window === 'undefined') return null;
    syncBrowserStorageFromCookies();
    return syncWorkspaceFromToken();
  },

  setWorkspaceId: (id: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORKSPACE_KEY, id);
    setBrowserCookie(WORKSPACE_KEY, id);
    emitStorageChange();
  },

  clear: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    clearBrowserAuthCookies();
    emitStorageChange();
  },

  ensureAuthCookie: (): void => {
    if (typeof window === 'undefined') return;
    const token =
      localStorage.getItem(TOKEN_KEY) ||
      readBrowserCookie(TOKEN_KEY) ||
      readBrowserCookie(LEGACY_TOKEN_COOKIE_KEY);
    if (!token) return;

    setBrowserCookie(TOKEN_KEY, token);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      setBrowserCookie(REFRESH_TOKEN_KEY, refreshToken);
    }

    const workspaceId = localStorage.getItem(WORKSPACE_KEY);
    if (workspaceId) {
      setBrowserCookie(WORKSPACE_KEY, workspaceId);
    }

    setBrowserAuthCookie();
    syncWorkspaceFromToken();
  },
};

// ============================================
// apiFetch - Base fetch with auth headers
// ============================================

const API_URL = API_BASE;

// Mutex to prevent concurrent refresh attempts (race condition on polling pages)
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in-flight, wait for its result instead of starting a new one
  if (refreshPromise) return refreshPromise;

  refreshPromise = doRefreshAccessToken();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function doRefreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      tokenStorage.clear();
      return false;
    }

    const data = await res.json();
    const newToken = data.access_token || data.accessToken;
    const newRefresh = data.refresh_token || data.refreshToken;
    if (newToken) {
      tokenStorage.setToken(newToken);
      if (newRefresh) {
        tokenStorage.setRefreshToken(newRefresh);
      }
      return true;
    }

    return false;
  } catch {
    tokenStorage.clear();
    return false;
  }
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: Omit<RequestInit, 'body'> & {
    body?: any;
    params?: Record<string, string | undefined>;
  } = {},
): Promise<ApiResponse<T>> {
  const token = tokenStorage.getToken();
  const workspaceId = tokenStorage.getWorkspaceId();
  const isProxyEndpoint = endpoint.startsWith('/api/');

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    // CSRF mitigation: custom header prevents cross-origin form submissions
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    if (isProxyEndpoint) {
      headers['x-kloel-access-token'] = token;
    }
  }

  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
    if (isProxyEndpoint) {
      headers['x-kloel-workspace-id'] = workspaceId;
    }
  }

  let url = isProxyEndpoint ? endpoint : `${API_URL}${endpoint}`;

  // Append query params if provided
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) searchParams.set(key, value);
    }
    const qs = searchParams.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  // Auto-stringify body if it's an object
  const body =
    options.body &&
    typeof options.body === 'object' &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof ArrayBuffer)
      ? JSON.stringify(options.body)
      : options.body;

  try {
    const res = await fetch(url, {
      ...options,
      credentials: 'include', // Send httpOnly cookies
      body,
      headers,
    });

    // Handle 401 - try refresh token
    if (res.status === 401 && tokenStorage.getRefreshToken()) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${tokenStorage.getToken()}`;
        const retryRes = await fetch(url, {
          ...options,
          credentials: 'include', // Send httpOnly cookies
          headers,
          body,
        });
        const retryData = await retryRes.json().catch(() => ({}));
        if (!retryRes.ok) {
          const rawRetryMsg = retryData.message;
          const retryMessage = Array.isArray(rawRetryMsg) ? rawRetryMsg.join(', ') : rawRetryMsg;
          return {
            error: retryMessage || retryData.error || `HTTP ${retryRes.status}`,
            status: retryRes.status,
          };
        }
        return buildSuccessResponse(retryData, retryRes.status);
      }
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const rawMsg = data.message;
      const message = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg;
      return {
        error: message || data.error || `HTTP ${res.status}`,
        status: res.status,
      };
    }

    return buildSuccessResponse(data, res.status);
  } catch (err: any) {
    return {
      error: err.message || 'Network error',
      status: 0,
    };
  }
}

// ============================================
// Shared helpers
// ============================================

export const buildQuery = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export const authHeaders = (token?: string): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};

// ============================================
// Wallet API
// ============================================

export async function getWalletBalance(workspaceId: string): Promise<WalletBalance> {
  const res = await apiFetch<WalletBalance>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/balance`,
  );
  if (res.error) throw new Error(res.error);
  return res.data as WalletBalance;
}

export async function getWalletTransactions(workspaceId: string): Promise<WalletTransaction[]> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/transactions`);
  if (res.error) throw new Error(res.error);
  const data = res.data as Record<string, any> | undefined;
  if (Array.isArray(data)) return data;
  return data?.transactions || [];
}

export async function processSale(
  workspaceId: string,
  data: { amount: number; saleId: string; description: string; kloelFeePercent?: number },
): Promise<any> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/process-sale`, {
    method: 'POST',
    body: data,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function requestWithdrawal(
  workspaceId: string,
  amount: number,
  bankAccount: string,
): Promise<any> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/withdraw`, {
    method: 'POST',
    body: { amount, bankAccount },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function confirmTransaction(workspaceId: string, transactionId: string): Promise<any> {
  const res = await apiFetch<any>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/confirm/${encodeURIComponent(transactionId)}`,
    {
      method: 'POST',
    },
  );
  if (res.error) throw new Error(res.error);
  return res.data;
}

// ============================================
// Memory API
// ============================================

export async function getMemoryStats(
  workspaceId: string,
): Promise<{ totalItems: number; products: number; knowledge: number }> {
  const res = await apiFetch<{ totalItems: number; products: number; knowledge: number }>(
    `/kloel/memory/${workspaceId}/stats`,
  );
  if (res.error) throw new Error('Failed to fetch memory stats');
  return res.data as { totalItems: number; products: number; knowledge: number };
}

export async function getMemoryList(workspaceId: string): Promise<MemoryItem[]> {
  const res = await apiFetch<any>(`/kloel/memory/${workspaceId}/list`);
  if (res.error) throw new Error('Failed to fetch memories');
  const data = res.data as Record<string, any> | undefined;
  return data?.memories || [];
}

export async function saveProduct(workspaceId: string, product: Product): Promise<any> {
  const res = await apiFetch<any>(`/kloel/memory/${workspaceId}/product`, {
    method: 'POST',
    body: product,
  });
  if (res.error) throw new Error('Failed to save product');
  return res.data;
}

export async function searchMemory(workspaceId: string, query: string): Promise<MemoryItem[]> {
  const res = await apiFetch<any>(`/kloel/memory/${workspaceId}/search`, {
    method: 'POST',
    body: { query },
  });
  if (res.error) throw new Error('Failed to search memory');
  const data = res.data as Record<string, any> | undefined;
  return data?.memories || [];
}

// ============================================
// Leads API
// ============================================

export async function getLeads(
  workspaceId: string,
  params?: { status?: string; search?: string; limit?: number },
): Promise<Lead[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('q', params.search);
  if (params?.limit) query.set('limit', String(params.limit));

  const endpoint = `/kloel/leads/${encodeURIComponent(workspaceId)}${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const res = await apiFetch<any>(endpoint);
  if (res.error) throw new Error(res.error);

  const data = res.data;
  if (Array.isArray(data)) return data;
  if (
    data &&
    typeof data === 'object' &&
    'leads' in data &&
    Array.isArray((data as Record<string, unknown>).leads)
  )
    return (data as Record<string, unknown>).leads as Lead[];
  return [];
}

// ============================================
// Generic API client
// ============================================

export const api = {
  async get<T = any>(endpoint: string): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
    }

    const res = await apiFetch<T>(endpoint, { method: 'GET' });
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
  },

  async post<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
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
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
  },

  async put<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
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
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
  },

  async delete<T = any>(endpoint: string): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
    }

    const res = await apiFetch<T>(endpoint, { method: 'DELETE' });
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
  },
};
