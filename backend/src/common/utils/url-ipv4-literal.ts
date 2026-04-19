/**
 * IPv4 literal parser kept in its own module so Lizard measures it
 * independently from the range classifier (sibling modules are the
 * only reliable way to stop the TypeScript grammar from bundling
 * small neighbouring functions into the nearest exported symbol).
 */

const IPV4_LITERAL_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isValidOctet(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

export function parseIpv4Literal(hostname: string): number[] | null {
  if (!IPV4_LITERAL_RE.test(hostname)) return null;
  const octets = hostname.split('.').map((part) => Number(part));
  return octets.every(isValidOctet) ? octets : null;
}
