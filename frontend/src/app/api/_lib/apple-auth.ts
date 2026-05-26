/**
 * Shared helpers for Apple OAuth start/callback routes (auth + social-checkout).
 *
 * Both surfaces (regular signup at /api/auth/apple, social-checkout at
 * /api/checkout/social/apple) need the same client-id resolution + Apple
 * `user` POST payload parsing, so the duplicated logic lives here.
 */

export interface AppleUserPayload {
  email?: string;
  name?: {
    firstName?: string;
    lastName?: string;
  };
}

/** Resolves the Apple OAuth client id from env. Returns '' when missing. */
export function readAppleClientId(): string {
  return (
    process.env.APPLE_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim() || ''
  );
}

/**
 * Parses Apple's `user` form field, sent only on the first sign-in for a
 * given Apple ID. Returns undefined for empty/non-string/malformed input
 * (Apple repeatedly sends an absent value, and that's expected).
 */
export function parseAppleUser(rawUser: FormDataEntryValue | null): AppleUserPayload | undefined {
  if (typeof rawUser !== 'string' || !rawUser.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawUser) as AppleUserPayload;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
