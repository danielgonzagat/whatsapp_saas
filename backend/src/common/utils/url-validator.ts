import { BadRequestException } from '@nestjs/common';
import { assertNotInternalAddress } from './url-private-ranges';

const PATTERN_RE = /\.+$/g;

function normalizeHostname(value: string): string {
  return String(value || '')
    .trim()
    .replace(PATTERN_RE, '')
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

/** Parse safe url. */
export function parseSafeUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(String(urlString || '').trim());
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestException('Protocol not allowed');
  }
  if (url.username || url.password) {
    throw new BadRequestException('URL credentials are not allowed');
  }
  assertNotInternalAddress(url.hostname);
  return url;
}

/** Is allowed hostname. */
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

/**
 * Validates a URL against a set of allowed hostnames.
 * Use for calls to known external APIs (Meta, OpenAI, Stripe, etc.).
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

/** Collect allowed hosts. */
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

/** Validate allowlisted user url. */
export function validateAllowlistedUserUrl(urlString: string, allowedHosts: Iterable<string>): URL {
  const url = parseSafeUrl(urlString);
  if (!isAllowedHostname(url.hostname, allowedHosts)) {
    throw new BadRequestException('Host not allowed');
  }
  return url;
}
