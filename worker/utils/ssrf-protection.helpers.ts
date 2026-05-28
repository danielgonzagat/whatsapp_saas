/**
 * Pure helpers extracted from ssrf-protection.ts so they can be unit-tested in
 * isolation without DNS, fetch, or AbortController side effects.
 *
 * All exports in this module MUST stay deterministic — no `await`, no I/O, no
 * network, no `Date.now()`. The host module (`ssrf-protection.ts`) layers the
 * async surface (`validateUrl`, `safeRequest`) on top of these primitives.
 */

import { isIP } from 'node:net';

/** Matches an IPv6 string that ends in an IPv4-mapped tail (e.g. `::ffff:192.0.2.1`). */
export const FFFF_MAPPED_IPV4_RE = /^(?:.*:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** Private / reserved IPv4 ranges (closed intervals) used by {@link isPrivateIP}. */
export const PRIVATE_IP_RANGES: ReadonlyArray<{ start: string; end: string }> = [
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

/** TCP ports that must never be reachable through a worker-issued HTTP fetch. */
export const BLOCKED_PORTS: ReadonlyArray<number> = [
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

/** Hostnames that must never resolve (cloud metadata endpoints + loopback names). */
export const BLOCKED_HOSTNAMES: ReadonlyArray<string> = [
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

/** HTTP status codes that trigger an explicit redirect follow. */
export const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Error message fragments used by the SSRF guard so callers can match on a prefix. */
export const SSRF_REQUEST_ERRORS = {
  redirectsExceeded: 'Número máximo de redirects excedido',
  allowlistPrefix: 'URL não está na allowlist: ',
  validationPrefix: 'SSRF bloqueado: ',
} as const;

/** Structured result returned by URL validation in the host module. */
export interface UrlValidation {
  /** Whether the URL passed every check. */
  valid: boolean;
  /** Human-readable failure reason (PT-BR), if any. */
  error?: string;
  /** First IP literal the host resolved to, when available. */
  resolvedIP?: string;
}

/** Build a fresh SSRF request error so call sites can throw a typed `Error`. */
export function createSsrfRequestError(message: string): Error {
  return new Error(message);
}

/**
 * Lower-case, trim, and strip surrounding `[]` brackets from a host string.
 *
 * Required because IPv6 literals in URLs arrive bracketed (`[::1]`) and the
 * private-range checks compare against raw colon-separated digits.
 */
export function normalizeHost(host: string): string {
  const trimmed = String(host || '')
    .trim()
    .toLowerCase();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Convert a dotted-quad IPv4 string into a 32-bit unsigned integer for fast
 * range membership tests.
 *
 * Note: callers MUST pre-validate the input is a 4-octet IPv4 literal —
 * non-numeric parts will produce `NaN` arithmetic.
 */
export function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Returns `true` when an IPv6 address is in a private, loopback, link-local,
 * unique-local, documentation, or IPv4-mapped private range.
 */
export function isPrivateIPv6(ip: string): boolean {
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

  const mappedIpv4 = normalized.match(FFFF_MAPPED_IPV4_RE);
  if (mappedIpv4?.[1]) {
    return isPrivateIP(mappedIpv4[1]);
  }

  return false;
}

/**
 * Returns `true` when an IP literal (v4 or v6) belongs to a private, reserved,
 * or otherwise non-routable range. Inputs that are not a valid IP literal are
 * treated as private (fail-closed) so callers cannot accidentally bypass the
 * guard with malformed text.
 */
export function isPrivateIP(ip: string): boolean {
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

/**
 * Wrap `new URL(...)` so callers get a discriminated union instead of a thrown
 * `TypeError`. The `error` branch carries a localized message for surfacing to
 * operators.
 */
export function parseUrl(urlString: string): { url: URL } | { error: string } {
  try {
    return { url: new URL(urlString) };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'erro desconhecido';
    return { error: `URL inválida: ${msg}` };
  }
}

/**
 * Synchronous slice of URL validation: protocol allow-list, blocked hostnames,
 * private-IP literals in the host slot, and blocked ports.
 *
 * Returns `null` when every rule passes (caller then escalates to DNS).
 */
export function validateBasicRules(url: URL): UrlValidation | null {
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

/**
 * Strip `X-Forwarded-For` / `X-Real-IP` from outbound request headers so a
 * compromised flow cannot impersonate an upstream caller when forwarding a
 * request through the worker.
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const { 'X-Forwarded-For': _xff, 'X-Real-IP': _xri, ...safeHeaders } = headers;
  void _xff;
  void _xri;
  return safeHeaders;
}

/**
 * Prefix-based allow-list match. An empty allow-list is treated as "everything
 * allowed" so callers can opt-in to allow-listing without rewriting the
 * comparison call.
 */
export function isUrlAllowed(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true;
  }
  return allowlist.some((prefix) => url.startsWith(prefix));
}
