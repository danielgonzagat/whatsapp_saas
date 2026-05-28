import { randomBytes } from 'node:crypto';

/**
 * Cryptographically-uniform random sample in `[0, 1)`.
 *
 * Required by the WISDOM differential-privacy pipeline (laplacianNoise) —
 * `Math.random()` is NOT cryptographically uniform and weakens the
 * ε-differential-privacy bound it underpins. Implemented as `uint32 / 2**32`
 * to give the inverse-CDF Laplace transform a clean uniform distribution.
 *
 * Used by:
 *   - wisdom-anonymizer.ts::laplacianNoise
 *   - wisdom-privacy-guard.service.ts::diffPrivacyNoise
 */
export function secureUniform(): number {
  return randomBytes(4).readUInt32BE(0) / 2 ** 32;
}
