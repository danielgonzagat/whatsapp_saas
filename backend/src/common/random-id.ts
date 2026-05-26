import { randomBytes } from 'node:crypto';

/**
 * Generates a `length`-character random suffix suitable for use as the
 * non-time portion of an id like `rec_<ts>_<suffix>`.
 *
 * Backed by `crypto.randomBytes` (CSPRNG) — replaces the previously-pervasive
 * `Math.random().toString(36).slice(2, N)` pattern which produces predictable,
 * collision-prone IDs (audited in WAVE2_MATH_RANDOM_AUDIT). Hex encoding is
 * used (not base-36) so each character carries exactly 4 bits of entropy —
 * length=8 gives 32 bits, length=10 gives 40 bits, length=16 gives 64 bits.
 *
 * Use for non-security-critical ids where collision probability and
 * predictability matter. For cryptographic key material or session tokens,
 * use `crypto.randomUUID()` or `crypto.randomBytes(N).toString('hex')` directly.
 */
export function randomIdSegment(length: number): string {
  if (length <= 0 || !Number.isInteger(length)) {
    throw new Error('randomIdSegment length must be a positive integer');
  }
  // Each byte → 2 hex chars; ceil(length/2) bytes covers any length cleanly.
  const byteCount = Math.ceil(length / 2);
  return randomBytes(byteCount).toString('hex').slice(0, length);
}
