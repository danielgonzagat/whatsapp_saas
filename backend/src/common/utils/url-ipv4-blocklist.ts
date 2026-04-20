/**
 * IPv4 private-range classifier. The classification rules are kept as
 * pure data so the predicate is a single small loop — this is the only
 * way to keep each rule independent for Codacy / Lizard measurement
 * (the TS grammar bundles sibling predicate functions into the closest
 * exported symbol, inflating aggregate CCN).
 */

export { parseIpv4Literal } from './url-ipv4-literal';

type OctetRule = (first: number, second: number) => boolean;

const BLOCKED_RANGES: readonly OctetRule[] = [
  // 0.0.0.0/8 + 10.0.0.0/8 + 127.0.0.0/8 (this network, private, loopback)
  (first) => first === 0 || first === 10 || first === 127,
  // 100.64.0.0/10 shared address space
  (first, second) => first === 100 && second >= 64 && second <= 127,
  // 169.254.0.0/16 link-local
  (first, second) => first === 169 && second === 254,
  // 172.16.0.0/12 private
  (first, second) => first === 172 && second >= 16 && second <= 31,
  // 192.0.0.0/24 + 192.168.0.0/16 (documentation + private)
  (first, second) => first === 192 && (second === 0 || second === 168),
  // 198.18.0.0/15 benchmarking
  (first, second) => first === 198 && (second === 18 || second === 19),
  // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  (first) => first >= 224,
];

/** Is blocked ipv4 range. */
export function isBlockedIpv4Range([first, second]: number[]): boolean {
  return BLOCKED_RANGES.some((rule) => rule(first, second));
}
