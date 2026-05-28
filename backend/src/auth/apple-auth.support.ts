import { createSign, type JsonWebKey } from 'node:crypto';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_CLIENT_SECRET_TTL_SECONDS = 60 * 60 * 24 * 180;

export type AppleJwtHeader = {
  alg?: string;
  kid?: string;
};

export type AppleIdentityPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
};

export type AppleJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
};

export type AppleJwksResponse = {
  keys?: AppleJwk[];
};

export type AppleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type AppleUserHint = {
  name?: { firstName?: string; lastName?: string };
  email?: string;
};

export type AppleVerifiedToken = {
  payload: AppleIdentityPayload & { sub: string };
  raw: AppleTokenResponse | null;
};

// sanitizeAppleError is an alias for the canonical sanitizeAuthError —
// kept as a named export so apple-auth.service's existing imports work.
export { sanitizeAuthError as sanitizeAppleError } from './sanitize-auth-error.helper';

export function decodeBase64UrlJson<T>(segment: string): T {
  const decoded = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(decoded) as T;
}

function encodeAuthJson(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function buildClientSecret(input: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: input.keyId };
  const payload = {
    iss: input.teamId,
    iat: issuedAt,
    exp: issuedAt + APPLE_CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_ISSUER,
    sub: input.clientId,
  };
  const signingInput = `${encodeAuthJson(header)}.${encodeAuthJson(payload)}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: input.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

export function normalizeEmailVerified(value: AppleIdentityPayload['email_verified']): boolean {
  return value === true || value === 'true';
}

export function tokenAudienceIncludes(
  audience: AppleIdentityPayload['aud'],
  allowed: string[],
): boolean {
  if (typeof audience === 'string') {
    return allowed.includes(audience);
  }
  if (Array.isArray(audience)) {
    return audience.some((entry) => allowed.includes(entry));
  }
  return false;
}

export function buildAppleName(user?: AppleUserHint | null, email?: string): string {
  const firstName = user?.name?.firstName?.trim() || '';
  const lastName = user?.name?.lastName?.trim() || '';
  const joined = `${firstName} ${lastName}`.trim();
  if (joined) {
    return joined;
  }
  const fallbackEmail = email?.trim();
  return fallbackEmail ? fallbackEmail.split('@')[0] || 'Apple User' : 'Apple User';
}
