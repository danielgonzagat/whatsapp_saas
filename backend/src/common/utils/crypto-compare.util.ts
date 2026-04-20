import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Uses `crypto.timingSafeEqual` under the hood. Returns `false`
 * immediately when either argument is empty, because there is no
 * secret to leak in that case.
 *
 * **When to use:** any comparison of secrets, tokens, HMAC digests,
 * or API keys that arrive in HTTP headers / query params.
 */
export function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));

  // Short-circuit on empty — nothing to leak via timing.
  if (bufA.length === 0 || bufB.length === 0) {
    return false;
  }

  // timingSafeEqual requires equal-length buffers.
  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
