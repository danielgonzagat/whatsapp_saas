import { createHmac } from 'node:crypto';
import { safeCompareStrings } from '../utils/crypto-compare.util';

/**
 * Canonical HMAC-SHA256 webhook signature verification.
 *
 * Mirrors Meta's `X-Hub-Signature-256` scheme byte-for-byte: the expected
 * value is `sha256=<lowercase-hex-hmac>` of the raw request body keyed with the
 * app secret, compared in constant time against the incoming header.
 *
 * Shared by both Meta webhook receivers
 * (`meta/meta-webhook.controller.ts` and
 * `meta/webhooks/meta-webhook.controller.ts`) — same HMAC-SHA256 scheme,
 * one implementation. Providers using a different scheme (TikTok, Stripe,
 * Mercadopago) must NOT route through this helper.
 *
 * Fails closed: returns `false` when the secret or signature header is
 * missing/empty, and uses `safeCompareStrings` (timing-safe) for the digest
 * comparison so no information leaks via comparison time.
 *
 * @param rawBody the exact bytes of the request body as received (Buffer
 *   preferred; a string is hashed as UTF-8). Callers MUST pass the raw body,
 *   not a re-serialized object, or the digest will not match.
 * @param signatureHeader the incoming signature header value, e.g.
 *   `sha256=ab12…`.
 * @param secret the shared app secret (Meta `META_APP_SECRET`).
 * @returns `true` only when the computed `sha256=<hmac>` matches the header.
 */
export function verifyHmacSha256Signature(
  rawBody: Buffer | string,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!secret || !signatureHeader) {
    return false;
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

  return safeCompareStrings(signatureHeader, expected);
}
