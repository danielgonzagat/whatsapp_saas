/**
 * SSRF-hardened URL guard for storage signed URLs and any user-influenced
 * fetch target. Builds on top of `url-validator` literal checks with an
 * additional DNS-lookup pass so DNS rebinding and CNAME redirects to
 * private/metadata IPs are rejected before the request leaves the box.
 *
 * Use `assertSafeStorageUrl` everywhere the backend issues `fetch()` /
 * `axios()` against a signed URL or any URL whose host is influenced by
 * tenant input. For redirect-following requests, set `redirect: 'manual'`
 * on the underlying fetch and re-call this helper on the `Location` header
 * before issuing the next hop.
 */
import { lookup as dnsLookupCb } from 'node:dns';
import { promisify } from 'node:util';
import { BadRequestException } from '@nestjs/common';
import { getTraceHeaders } from '../trace-headers';
import { isBlockedIpv4Range, parseIpv4Literal } from './url-ipv4-blocklist';
import { isAllowedHostname } from './url-validator';

const defaultLookup = promisify(dnsLookupCb);

const ALLOWED_PROTOCOLS = new Set<string>(['https:']);
const DEV_HTTP_PROTOCOL = 'http:';

const ALLOWED_PORTS = new Set<string>(['', '443']);
const DEV_HTTP_PORT = '80';

const BLOCKED_IPV6_PREFIXES = ['::1', '::ffff:', 'fe80', 'fec0', 'fc', 'fd'] as const;

interface DnsLookupResult {
  address: string;
  family: number;
}

type DnsLookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<DnsLookupResult[]>;

export interface AssertSafeStorageUrlOptions {
  /** Exact hostnames allowed (no suffix matching by default). */
  allowedHosts: Iterable<string>;
  /** Allow `http://` on port 80 (dev only, default false). */
  allowHttp?: boolean;
  /** Allow suffix matching via `isAllowedHostname` (default false — exact match). */
  allowHostSuffix?: boolean;
  /** Override DNS resolver (used in tests). */
  dnsLookup?: DnsLookupFn;
}

function assertProtocol(url: URL, allowHttp: boolean): void {
  if (ALLOWED_PROTOCOLS.has(url.protocol)) {
    return;
  }
  if (allowHttp && url.protocol === DEV_HTTP_PROTOCOL) {
    return;
  }
  throw new BadRequestException(`Protocol not allowed: ${url.protocol}`);
}

function assertPort(url: URL, allowHttp: boolean): void {
  if (ALLOWED_PORTS.has(url.port)) {
    return;
  }
  if (allowHttp && url.port === DEV_HTTP_PORT) {
    return;
  }
  throw new BadRequestException(`Port not allowed: ${url.port || '(default)'}`);
}

function assertNoCredentials(url: URL): void {
  if (url.username || url.password) {
    throw new BadRequestException('URL credentials are not allowed');
  }
}

function normaliseHostList(allowedHosts: Iterable<string>): string[] {
  const out: string[] = [];
  for (const h of allowedHosts) {
    const v = String(h || '')
      .trim()
      .toLowerCase();
    if (v) out.push(v);
  }
  return out;
}

function assertHostInAllowlist(
  hostname: string,
  allowedHosts: Iterable<string>,
  allowSuffix: boolean,
): void {
  const host = hostname.toLowerCase();
  const list = normaliseHostList(allowedHosts);
  if (list.length === 0) {
    throw new BadRequestException('Allowed hosts not configured');
  }
  if (allowSuffix) {
    if (!isAllowedHostname(host, list)) {
      throw new BadRequestException(`Host not allowed: ${host}`);
    }
    return;
  }
  if (!list.includes(host)) {
    throw new BadRequestException(`Host not allowed: ${host}`);
  }
}

function isPrivateOrInternalIpv4(address: string): boolean {
  const octets = parseIpv4Literal(address);
  return Boolean(octets && isBlockedIpv4Range(octets));
}

function isPrivateOrInternalIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  return BLOCKED_IPV6_PREFIXES.some((p) => lower.startsWith(p));
}

function isPrivateOrInternalIp(address: string, family: number): boolean {
  if (family === 4) return isPrivateOrInternalIpv4(address);
  if (family === 6) return isPrivateOrInternalIpv6(address);
  return false;
}

async function resolveAndAssertPublicIp(hostname: string, dnsLookup: DnsLookupFn): Promise<void> {
  let results: DnsLookupResult[];
  try {
    results = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException(`Hostname did not resolve: ${hostname}`);
  }
  if (!Array.isArray(results) || results.length === 0) {
    throw new BadRequestException(`Hostname did not resolve: ${hostname}`);
  }
  for (const r of results) {
    if (isPrivateOrInternalIp(r.address, r.family)) {
      throw new BadRequestException(
        `Hostname resolves to private/internal address: ${hostname} -> ${r.address}`,
      );
    }
  }
}

/**
 * Hardened SSRF guard. Throws BadRequestException on any unsafe URL.
 * Returns the parsed `URL` on success.
 */
export async function assertSafeStorageUrl(
  rawUrl: string,
  options: AssertSafeStorageUrlOptions,
): Promise<URL> {
  const allowHttp = options.allowHttp === true;
  const allowSuffix = options.allowHostSuffix === true;
  const dnsLookup: DnsLookupFn =
    options.dnsLookup ?? ((hostname, lookupOptions) => defaultLookup(hostname, lookupOptions));

  let url: URL;
  try {
    url = new URL(String(rawUrl ?? '').trim());
  } catch {
    throw new BadRequestException('Invalid URL');
  }

  assertProtocol(url, allowHttp);
  assertPort(url, allowHttp);
  assertNoCredentials(url);
  assertHostInAllowlist(url.hostname, options.allowedHosts, allowSuffix);
  await resolveAndAssertPublicIp(url.hostname, dnsLookup);

  return url;
}

/**
 * Issue a redirect-safe fetch against a signed storage URL. Each hop is
 * re-validated through `assertSafeStorageUrl`. Caps redirects to prevent
 * loops. Returns the final `Response` (which is non-redirect).
 */
export async function safeStorageFetch(
  rawUrl: string,
  options: AssertSafeStorageUrlOptions & {
    init?: RequestInit;
    maxRedirects?: number;
  },
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = await assertSafeStorageUrl(rawUrl, options);

  for (let i = 0; i <= maxRedirects; i += 1) {
    const headers = new Headers(options.init?.headers);
    for (const [name, value] of Object.entries(getTraceHeaders())) {
      if (!headers.has(name)) {
        headers.set(name, value);
      }
    }

    const controller = new AbortController();
    const timeoutMs = 30_000;
    const timer = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs);

    const request = new Request(currentUrl, {
      ...(options.init ?? {}),
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    const response = await fetch(request).finally(() => clearTimeout(timer));

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new BadRequestException('Redirect response missing Location header');
      }
      currentUrl = await assertSafeStorageUrl(new URL(location, currentUrl).toString(), options);
      continue;
    }

    return response;
  }

  throw new BadRequestException('Too many redirects');
}
