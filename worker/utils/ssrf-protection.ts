/**
 * Proteção contra SSRF (Server-Side Request Forgery)
 *
 * Valida URLs antes de fazer requisições HTTP para evitar que
 * atacantes acessem serviços internos ou recursos privados.
 *
 * PROTEÇÕES:
 * - Bloqueia IPs privados (RFC 1918, RFC 4193, RFC 6598)
 * - Bloqueia localhost e loopback
 * - Bloqueia IPs de link-local
 * - Verifica DNS resolvido (evita DNS rebinding)
 * - Limita protocolos a HTTP/HTTPS
 * - Bloqueia portas sensíveis
 *
 * Pure helpers (host normalization, IP range checks, header sanitization, URL
 * parsing, allowlist matching) live in {@link ./ssrf-protection.helpers} so
 * they can be unit-tested without DNS or fetch side effects.
 */

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import {
  createSsrfRequestError,
  isPrivateIP,
  isUrlAllowed,
  normalizeHost,
  parseUrl,
  sanitizeHeaders,
  SSRF_REQUEST_ERRORS,
  REDIRECT_STATUSES,
  validateBasicRules,
  type UrlValidation,
} from './ssrf-protection.helpers';

// Re-export pure helpers that have public consumers (allowlist matching is
// imported by flow-node-executor.actions / .api) and the validation result
// shape so downstream signatures keep compiling without a path update.
export { isUrlAllowed, type UrlValidation };

async function validateDnsResolution(hostname: string): Promise<UrlValidation> {
  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    if (!Array.isArray(results) || results.length === 0) {
      return { valid: false, error: `Falha ao resolver DNS: ${hostname}` };
    }

    for (const result of results) {
      const resolvedIP = normalizeHost(result.address);
      if (isPrivateIP(resolvedIP)) {
        return {
          valid: false,
          error: `DNS resolve para IP privado: ${hostname} -> ${resolvedIP}`,
          resolvedIP,
        };
      }
    }

    return { valid: true, resolvedIP: normalizeHost(results[0].address) };
  } catch {
    return { valid: false, error: `Falha ao resolver DNS: ${hostname}` };
  }
}

/**
 * Valida se uma URL é segura para fazer requisições
 */
export async function validateUrl(urlString: string): Promise<UrlValidation> {
  const parsed = parseUrl(urlString);
  if ('error' in parsed) {
    return { valid: false, error: parsed.error };
  }

  const basic = validateBasicRules(parsed.url);
  if (basic) {
    return basic;
  }

  const hostname = normalizeHost(parsed.url.hostname);
  if (isIP(hostname)) {
    return { valid: true, resolvedIP: hostname };
  }

  return validateDnsResolution(hostname);
}

/**
 * Opções para requisição segura
 */
export interface SafeRequestOptions {
  /** Url property. */
  url: string;
  /** Method property. */
  method?: string;
  /** Headers property. */
  headers?: Record<string, string>;
  /** Body property. */
  body?: string;
  /** Timeout property. */
  timeout?: number;
  /** Max redirects property. */
  maxRedirects?: number;
  /** Allowlist property. */
  allowlist?: string[];
}

async function handleRedirect(
  response: Response,
  options: SafeRequestOptions,
  currentUrl: string,
  maxRedirects: number,
): Promise<Response | null> {
  if (!REDIRECT_STATUSES.has(response.status)) {
    return null;
  }

  const location = response.headers.get('location');
  if (location && maxRedirects > 0) {
    const redirectUrl = new URL(location, currentUrl).toString();
    return safeRequest({
      ...options,
      url: redirectUrl,
      maxRedirects: maxRedirects - 1,
    });
  }
  if (maxRedirects <= 0) {
    throw createSsrfRequestError(SSRF_REQUEST_ERRORS.redirectsExceeded);
  }
  return null;
}

/**
 * Faz uma requisição HTTP segura com proteção SSRF
 */
export async function safeRequest(options: SafeRequestOptions): Promise<Response> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeout = 10000,
    maxRedirects = 5,
    allowlist = [],
  } = options;

  if (allowlist.length > 0 && !allowlist.some((prefix) => url.startsWith(prefix))) {
    throw createSsrfRequestError([SSRF_REQUEST_ERRORS.allowlistPrefix, url].join(''));
  }

  const validation = await validateUrl(url);
  if (!validation.valid) {
    throw createSsrfRequestError(
      [SSRF_REQUEST_ERRORS.validationPrefix, validation.error || 'erro desconhecido'].join(''),
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: sanitizeHeaders(headers),
      body: body ?? null,
      signal: controller.signal,
      redirect: 'manual',
    });

    const redirected = await handleRedirect(response, options, url, maxRedirects);
    if (redirected) {
      return redirected;
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
