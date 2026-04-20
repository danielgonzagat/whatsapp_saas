import { AdminApiClientError, type AdminApiErrorShape } from './admin-errors';
import { adminSessionStorage } from '../auth/admin-session-storage';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:3001/admin';

interface AdminFetchOptions<TBody> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: TBody;
  auth?: 'access' | 'explicit' | 'none';
  explicitToken?: string;
  signal?: AbortSignal;
}

/**
 * Low-level fetch wrapper. Handles:
 *  - prefixing every call with the admin API base URL
 *  - attaching the current access token (or an explicit short-lived token)
 *  - translating non-2xx JSON bodies into AdminApiClientError
 *
 * Intentionally does NOT auto-refresh on 401 — refresh logic lives in
 * admin-session-storage.getAccessToken so call sites can choose whether to
 * retry.
 */
export async function adminFetch<TResponse = unknown, TBody = unknown>(
  path: string,
  options: AdminFetchOptions<TBody> = {},
): Promise<TResponse> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const auth = options.auth ?? 'access';
  if (auth === 'access') {
    const token = await adminSessionStorage.getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else if (auth === 'explicit' && options.explicitToken) {
    headers.Authorization = `Bearer ${options.explicitToken}`;
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();
  const payload = text
    ? ((): unknown => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { code: 'admin.internal.parse_error', message: text };
        }
      })()
    : {};

  if (!response.ok) {
    throw new AdminApiClientError(response.status, payload as AdminApiErrorShape);
  }

  return payload as TResponse;
}

/** Admin api url. */
export const adminApiUrl = API_URL;
