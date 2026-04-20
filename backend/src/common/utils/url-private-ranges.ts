/**
 * Facade that asserts the given hostname is NOT a localhost / private /
 * metadata / internal-IPv6 endpoint. The IPv4 classifier and its literal
 * parser live in sibling modules so Codacy / Lizard measures every helper
 * independently (TypeScript grammar bundles sibling functions otherwise).
 */
import { BadRequestException } from '@nestjs/common';
import { isBlockedIpv4Range, parseIpv4Literal } from './url-ipv4-blocklist';

export { isBlockedIpv4Range, parseIpv4Literal };

const LOCALHOST_LITERALS = new Set<string>(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

const CLOUD_METADATA_LITERALS = new Set<string>(['169.254.169.254', 'metadata.google.internal']);

const INTERNAL_IPV6_PREFIXES = ['[::', '[fe80', '[fc', '[fd'] as const;

function isLocalhostLiteral(hostname: string): boolean {
  return LOCALHOST_LITERALS.has(hostname);
}

function isCloudMetadataLiteral(hostname: string): boolean {
  return CLOUD_METADATA_LITERALS.has(hostname);
}

function isInternalIpv6Literal(hostname: string): boolean {
  return INTERNAL_IPV6_PREFIXES.some((prefix) => hostname.startsWith(prefix));
}

function checkIpv4PrivateRange(hostname: string): void {
  const ipv4 = parseIpv4Literal(hostname);
  if (ipv4 && isBlockedIpv4Range(ipv4)) {
    throw new BadRequestException('Access to private network blocked');
  }
}

/** Assert not internal address. */
export function assertNotInternalAddress(hostname: string): void {
  const h = hostname.toLowerCase();

  if (isLocalhostLiteral(h)) {
    throw new BadRequestException('Access to localhost blocked');
  }
  if (isCloudMetadataLiteral(h)) {
    throw new BadRequestException('Access to cloud metadata blocked');
  }

  checkIpv4PrivateRange(h);

  if (isInternalIpv6Literal(h)) {
    throw new BadRequestException('Access to internal IPv6 blocked');
  }
}
