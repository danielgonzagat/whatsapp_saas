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
 */

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const FFFF___D_1_3_RE = /^(?:.*:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

// Ranges de IP privados (CIDR notation convertida para verificação)
const PRIVATE_IP_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // Private Class A
  { start: '10.0.0.0', end: '10.255.255.255' },
  // Private Class B
  { start: '172.16.0.0', end: '172.31.255.255' },
  // Private Class C
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // CGNAT (RFC 6598)
  { start: '100.64.0.0', end: '100.127.255.255' },
  // Broadcast
  { start: '255.255.255.255', end: '255.255.255.255' },
  // Current network
  { start: '0.0.0.0', end: '0.255.255.255' },
  // Documentation ranges
  { start: '192.0.2.0', end: '192.0.2.255' },
  { start: '198.51.100.0', end: '198.51.100.255' },
  { start: '203.0.113.0', end: '203.0.113.255' },
];

// Portas sensíveis que devem ser bloqueadas
const BLOCKED_PORTS = [
  22, // SSH
  23, // Telnet
  25, // SMTP
  135, // Windows RPC
  137, // NetBIOS
  138, // NetBIOS
  139, // NetBIOS
  445, // SMB
  1433, // MSSQL
  1434, // MSSQL
  3306, // MySQL
  3389, // RDP
  5432, // PostgreSQL
  5900, // VNC
  6379, // Redis
  27017, // MongoDB
];

// Hostnames bloqueados
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'metadata.google.internal', // GCP metadata
  '169.254.169.254', // AWS/GCP metadata
  'metadata.google.internal',
  'kubernetes.default',
  'kubernetes.default.svc',
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const SSRF_REQUEST_ERRORS = {
  redirectsExceeded: 'Número máximo de redirects excedido',
  allowlistPrefix: 'URL não está na allowlist: ',
  validationPrefix: 'SSRF bloqueado: ',
} as const;

function createSsrfRequestError(message: string) {
  return new Error(message);
}

function normalizeHost(host: string): string {
  const trimmed = String(host || '')
    .trim()
    .toLowerCase();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Converte IP string para número para comparação
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Verifica se um IP está em range privado
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = normalizeHost(ip).split('%')[0];
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('2001:db8:')
  ) {
    return true;
  }

  const mappedIpv4 = normalized.match(FFFF___D_1_3_RE);
  if (mappedIpv4?.[1]) {
    return isPrivateIP(mappedIpv4[1]);
  }

  return false;
}

function isPrivateIP(ip: string): boolean {
  const normalized = normalizeHost(ip);
  const version = isIP(normalized);

  if (version === 6) {
    return isPrivateIPv6(normalized);
  }

  if (version !== 4) {
    return true;
  }

  const ipNum = ipToNumber(normalized);

  for (const range of PRIVATE_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);

    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }

  return false;
}

type UrlValidation = {
  valid: boolean;
  error?: string;
  resolvedIP?: string;
};

function parseUrl(urlString: string): { url: URL } | { error: string } {
  try {
    return { url: new URL(urlString) };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'erro desconhecido';
    return { error: `URL inválida: ${msg}` };
  }
}

function validateBasicRules(url: URL): UrlValidation | null {
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: `Protocolo não permitido: ${url.protocol}` };
  }

  const hostname = normalizeHost(url.hostname);
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: `Hostname bloqueado: ${hostname}` };
  }

  if (isIP(hostname) && isPrivateIP(hostname)) {
    return { valid: false, error: `IP privado bloqueado: ${hostname}` };
  }

  const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80;
  if (BLOCKED_PORTS.includes(port)) {
    return { valid: false, error: `Porta bloqueada: ${port}` };
  }

  return null;
}

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

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const { 'X-Forwarded-For': _xff, 'X-Real-IP': _xri, ...safeHeaders } = headers;
  void _xff;
  void _xri;
  return safeHeaders;
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
      body: body || undefined,
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

/**
 * Verifica se uma URL está em uma allowlist
 */
export function isUrlAllowed(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true;
  }
  return allowlist.some((prefix) => url.startsWith(prefix));
}
