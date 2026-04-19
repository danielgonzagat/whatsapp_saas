/**
 * Pure helpers for detecting IPv4/IPv6 addresses that belong to
 * private, loopback, or cloud-metadata ranges.
 *
 * Extracted from url-validator.ts so that each function is measured
 * independently by complexity scanners (Codacy / lizard bundle neighbours
 * in TypeScript when left in the same file).
 */
import { BadRequestException } from '@nestjs/common';

const IPV4_LITERAL_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function parseIpv4Literal(hostname: string): number[] | null {
  if (!IPV4_LITERAL_RE.test(hostname)) {
    return null;
  }

  const octets = hostname.split('.').map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }

  return octets;
}

export function isBlockedIpv4Range([first, second]: number[]): boolean {
  if (first === 0 || first === 10 || first === 127) {
    return true;
  }

  if (first === 100 && second >= 64 && second <= 127) {
    return true;
  }

  if (first === 169 && second === 254) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  if (first === 192 && (second === 0 || second === 168)) {
    return true;
  }

  if (first === 198 && (second === 18 || second === 19)) {
    return true;
  }

  return first >= 224;
}

export function assertNotInternalAddress(hostname: string): void {
  const h = hostname.toLowerCase();
  const ipv4 = parseIpv4Literal(h);

  // Block localhost variants
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]') {
    throw new BadRequestException('Access to localhost blocked');
  }

  // Block cloud metadata endpoints
  if (h === '169.254.169.254' || h === 'metadata.google.internal') {
    throw new BadRequestException('Access to cloud metadata blocked');
  }

  if (ipv4 && isBlockedIpv4Range(ipv4)) {
    throw new BadRequestException('Access to private network blocked');
  }

  // Block IPv6 loopback and link-local
  if (h.startsWith('[::') || h.startsWith('[fe80') || h.startsWith('[fc') || h.startsWith('[fd')) {
    throw new BadRequestException('Access to internal IPv6 blocked');
  }
}
