// API Client for KLOEL Backend - Core module
// Types, token storage, apiFetch, wallet & memory functions
import { API_BASE } from '../http';

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
  paymentLink?: string;
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
const STORAGE_EVENT = 'kloel-storage-changed';

function emitStorageChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORAGE_EVENT));
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
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
    emitStorageChange();
  },

  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setRefreshToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
    emitStorageChange();
  },

  getWorkspaceId: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(WORKSPACE_KEY);
  },

  setWorkspaceId: (id: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORKSPACE_KEY, id);
    emitStorageChange();
  },

  clear: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    emitStorageChange();
  },
};

// ============================================
// apiFetch - Base fetch with auth headers
// ============================================

const API_URL = API_BASE;

async function refreshAccessToken(): Promise<boolean> {
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
  options: Omit<RequestInit, 'body'> & { body?: any; params?: Record<string, string | undefined> } = {}
): Promise<ApiResponse<T>> {
  const token = tokenStorage.getToken();
  const workspaceId = tokenStorage.getWorkspaceId();
  const isProxyEndpoint = endpoint.startsWith('/api/');

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
  const body = options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)
    ? JSON.stringify(options.body)
    : options.body;

  try {
    const res = await fetch(url, {
      ...options,
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
        return { data: retryData, status: retryRes.status };
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

    return { data, status: res.status };
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
  const res = await apiFetch<WalletBalance>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/balance`);
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

export async function processSale(workspaceId: string, data: { amount: number; saleId: string; description: string; kloelFeePercent?: number }): Promise<any> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/process-sale`, {
    method: 'POST',
    body: data,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function requestWithdrawal(workspaceId: string, amount: number, bankAccount: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/withdraw`, {
    method: 'POST',
    body: { amount, bankAccount },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function confirmTransaction(workspaceId: string, transactionId: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/confirm/${encodeURIComponent(transactionId)}`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

// ============================================
// Memory API
// ============================================

export async function getMemoryStats(workspaceId: string): Promise<{ totalItems: number; products: number; knowledge: number }> {
  const res = await apiFetch<{ totalItems: number; products: number; knowledge: number }>(`/kloel/memory/${workspaceId}/stats`);
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
  if (data && typeof data === 'object' && 'leads' in data && Array.isArray((data as Record<string, unknown>).leads)) return (data as Record<string, unknown>).leads as Lead[];
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
