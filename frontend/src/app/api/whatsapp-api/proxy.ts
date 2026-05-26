import { findFirstSequential } from '@/lib/async-sequence';
import type { NextRequest } from 'next/server';
import { getBackendCandidateUrls } from '../_lib/backend-url';
import {
  bearerFromHeaderOrCookie,
  isAuthRedirectLike,
  resolveWorkspaceHeader,
} from '../_lib/bearer-from-request';

interface ProxyRequestError extends Error {
  status?: number;
}

function createProxyRequestError(message: string, status = 502): ProxyRequestError {
  const error = new Error(message) as ProxyRequestError;
  error.status = status;
  return error;
}

const WHATSAPP_ACCESS_COOKIES = ['kloel_access_token', 'kloel_token'];

function resolveAuthorizationHeader(request: NextRequest): string | null {
  return (
    request.headers.get('authorization') ||
    bearerFromHeaderOrCookie(request, 'x-kloel-access-token', WHATSAPP_ACCESS_COOKIES)
  );
}

function buildHeaders(request: NextRequest, options?: { body?: string; accept?: string }) {
  const headers: Record<string, string> = {
    Accept: options?.accept || 'application/json',
  };

  const authorization = resolveAuthorizationHeader(request);
  if (authorization) {
    headers.Authorization = authorization;
  }

  const workspaceId = resolveWorkspaceHeader(request);
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }

  if (options?.body) {
    headers['Content-Type'] = request.headers.get('content-type') || 'application/json';
  }

  return headers;
}

async function fetchWhatsAppUpstream(
  request: NextRequest,
  method: 'GET' | 'POST' | 'DELETE',
  upstreamPath: string,
  options?: { accept?: string },
) {
  const rawBody = method === 'GET' ? undefined : await request.text();
  const headers = buildHeaders(request, {
    ...(rawBody !== undefined ? { body: rawBody } : {}),
    ...(options?.accept !== undefined ? { accept: options.accept } : {}),
  });
  let lastError: unknown;

  const response = await findFirstSequential(getBackendCandidateUrls(), async (baseUrl) => {
    const url = `${baseUrl}${upstreamPath}`;

    try {
      const attempt = await fetch(url, {
        method,
        headers,
        ...(rawBody !== undefined ? { body: rawBody } : {}),
        cache: 'no-store',
        redirect: 'manual',
      });

      if (attempt.status === 404 || attempt.status === 405) {
        lastError = new Error(`upstream ${attempt.status} at ${url}`);
        return null;
      }

      if (attempt.status >= 300 && attempt.status < 400) {
        const location = attempt.headers.get('location') || 'unknown-location';
        lastError = createProxyRequestError(
          `upstream redirect at ${url} -> ${location}`,
          isAuthRedirectLike(location) ? 401 : 502,
        );
        return null;
      }

      return attempt;
    } catch (error) {
      lastError = error;
      return null;
    }
  });

  if (response) {
    return response;
  }

  throw lastError || new Error('Unable to reach upstream WhatsApp endpoint');
}

/** Proxy whats app request. */
export async function proxyWhatsAppRequest(
  request: NextRequest,
  method: 'GET' | 'POST' | 'DELETE',
  upstreamPath: string,
) {
  if (!getBackendCandidateUrls().length) {
    throw new Error('BACKEND_URL/NEXT_PUBLIC_API_URL não configurado para o proxy WhatsApp');
  }
  const response = await fetchWhatsAppUpstream(request, method, upstreamPath);
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    const bodyPreview = (await response.text().catch(() => '')).slice(0, 240);
    throw createProxyRequestError(
      `Unexpected WhatsApp upstream response (${response.status}) content-type=${contentType || 'unknown'} body=${bodyPreview}`,
      isAuthRedirectLike(`${contentType} ${bodyPreview}`) ? 401 : 502,
    );
  }

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

/** Proxy whats app stream. */
export async function proxyWhatsAppStream(request: NextRequest, upstreamPath: string) {
  if (!getBackendCandidateUrls().length) {
    throw new Error('BACKEND_URL/NEXT_PUBLIC_API_URL não configurado para o proxy WhatsApp');
  }

  const response = await fetchWhatsAppUpstream(request, 'GET', upstreamPath, {
    accept: 'text/event-stream',
  });

  if (!response.body) {
    throw new Error('WhatsApp SSE upstream returned no body');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    const bodyPreview = (await response.text().catch(() => '')).slice(0, 240);
    throw createProxyRequestError(
      `Unexpected WhatsApp SSE upstream response (${response.status}) content-type=${contentType || 'unknown'} body=${bodyPreview}`,
      isAuthRedirectLike(`${contentType} ${bodyPreview}`) ? 401 : 502,
    );
  }

  const headers = new Headers();
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
