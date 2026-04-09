import { BadRequestException } from '@nestjs/common';

/**
 * Validates a URL against a set of allowed hostnames.
 * Use for calls to known external APIs (Meta, OpenAI, Asaas, etc.).
 */
export function validateExternalUrl(urlString: string, allowedHosts: Set<string>): URL {
  const url = parseSafeUrl(urlString);
  if (!isAllowedHostname(url.hostname, allowedHosts)) {
    throw new BadRequestException('Host not allowed');
  }
  return url;
}

/**
 * Validates a URL is not pointing to internal/private networks.
 * Use for user-supplied URLs (knowledge base, file downloads, etc.).
 */
export function validateNoInternalAccess(urlString: string): URL {
  return parseSafeUrl(urlString);
}

export function parseSafeUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('Protocol not allowed');
  }
  assertNotInternalAddress(url.hostname);
  return url;
}

export function isAllowedHostname(hostname: string, allowedHosts: Iterable<string>): boolean {
  const normalizedHost = normalizeHostname(hostname);
  if (!normalizedHost) {
    return false;
  }

  for (const candidate of allowedHosts) {
    const allowed = normalizeHostname(candidate);
    if (!allowed) {
      continue;
    }
    if (normalizedHost === allowed || normalizedHost.endsWith(`.${allowed}`)) {
      return true;
    }
  }

  return false;
}

export function collectAllowedHosts(...values: Array<string | null | undefined>): Set<string> {
  const hosts = new Set<string>();

  for (const rawValue of values) {
    const normalized = String(rawValue || '').trim();
    if (!normalized) {
      continue;
    }

    for (const item of normalized.split(',')) {
      const token = item.trim();
      if (!token) {
        continue;
      }

      const host = extractHostname(token);
      if (host) {
        hosts.add(host);
      }
    }
  }

  return hosts;
}

export function validateAllowlistedUserUrl(urlString: string, allowedHosts: Iterable<string>): URL {
  const url = parseSafeUrl(urlString);
  if (!isAllowedHostname(url.hostname, allowedHosts)) {
    throw new BadRequestException('Host not allowed');
  }
  return url;
}

function assertNotInternalAddress(hostname: string): void {
  const h = hostname.toLowerCase();

  // Block localhost variants
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]') {
    throw new BadRequestException('Access to localhost blocked');
  }

  // Block cloud metadata endpoints
  if (h === '169.254.169.254' || h === 'metadata.google.internal') {
    throw new BadRequestException('Access to cloud metadata blocked');
  }

  // Block private IPv4 ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h)) {
    throw new BadRequestException('Access to private network blocked');
  }

  // Block IPv6 loopback and link-local
  if (h.startsWith('[::') || h.startsWith('[fe80') || h.startsWith('[fc') || h.startsWith('[fd')) {
    throw new BadRequestException('Access to internal IPv6 blocked');
  }
}

function normalizeHostname(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\.+$/g, '')
    .toLowerCase();
}

function extractHostname(value: string): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    return normalizeHostname(new URL(normalized).hostname);
  } catch {
    return normalizeHostname(normalized);
  }
}
