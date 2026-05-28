/**
 * Shared production guard for token-crypto helpers (google-ads, meta, tiktok,
 * mailbox). Encapsulates the policy: missing key is a hard error in production,
 * but silently returns null in dev/test so local boot doesn't require all
 * provider secrets to be set.
 *
 * Three call sites used this exact 6-line implementation byte-for-byte before
 * canonicalization:
 *   - google-ads-token-crypto.ts
 *   - tiktok-token-crypto.ts
 *   - marketing/mailbox-token-crypto.ts
 */
export function handleMissingTokenCryptoKey(envVar: string): null {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[TOKEN_CRYPTO] ${envVar} is required in production`);
  }
  return null;
}
