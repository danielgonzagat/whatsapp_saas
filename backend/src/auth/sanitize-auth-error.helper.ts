/**
 * Sanitizes an unknown thrown value (from a 3rd-party auth provider — Apple,
 * Facebook, TikTok, ...) into a safe string suitable for inclusion in an
 * outgoing error message to the client.
 *
 * Preference order:
 *   1. Error.message (trimmed) if non-empty
 *   2. The string itself (trimmed) if non-empty
 *   3. The literal 'unknown_error'
 *
 * Three auth providers had byte-identical local implementations before
 * canonicalization: apple-auth.support (exported as sanitizeAppleError),
 * facebook-auth.service (local sanitizeErrorMessage), tiktok-auth.service
 * (local sanitizeTikTokError).
 */
export function sanitizeAuthError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'unknown_error';
}
