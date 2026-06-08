const PATTERN_RE = /-/g;
const PATTERN_RE_2 = /_/g;
/** Kloel token payload type. */
export type KloelTokenPayload = {
  sub?: string;
  email?: string;
  workspaceId?: string;
  role?: string;
  name?: string;
  guest?: boolean;
  anonymous?: boolean;
  authMode?: string;
  [key: string]: unknown;
};

function decodeBase64Json(base64Payload: string): Record<string, unknown> | null {
  const normalized = base64Payload.replace(PATTERN_RE, '+').replace(PATTERN_RE_2, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  try {
    const decoded =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Decode kloel jwt payload. */
export function decodeKloelJwtPayload(token?: string | null): KloelTokenPayload | null {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return null;
  }

  const parts = normalizedToken.split('.');
  if (parts.length < 2) {
    return null;
  }

  const payload = decodeBase64Json(parts[1] || '');
  return payload ? (payload as KloelTokenPayload) : null;
}

export function isKloelJwtExpired(
  token?: string | null,
  nowMs = Date.now(),
  skewSeconds = 30,
): boolean {
  const exp = decodeKloelJwtPayload(token)?.exp;
  if (typeof exp !== 'number') {
    return false;
  }

  return exp * 1000 <= nowMs + skewSeconds * 1000;
}

/** Is anonymous kloel payload. */
export function isAnonymousKloelPayload(payload?: KloelTokenPayload | null): boolean {
  if (!payload) {
    return false;
  }

  const email = String(payload.email || '')
    .trim()
    .toLowerCase();
  const authMode = String(payload.authMode || '')
    .trim()
    .toLowerCase();

  return (
    email.endsWith('@guest.kloel.local') ||
    payload.guest === true ||
    payload.anonymous === true ||
    authMode === 'anonymous'
  );
}

/** Is anonymous kloel token. */
export function isAnonymousKloelToken(token?: string | null): boolean {
  return isAnonymousKloelPayload(decodeKloelJwtPayload(token));
}

/** Has authenticated kloel token. */
export function hasAuthenticatedKloelToken(token?: string | null): boolean {
  const payload = decodeKloelJwtPayload(token);
  if (!payload || isKloelJwtExpired(token)) {
    return false;
  }

  return hasAuthenticatedKloelIdentity(payload);
}

/**
 * Identity-only check that ignores expiry. A token whose access window has
 * lapsed still carries a real authenticated identity that a refresh token can
 * renew, so callers that own a non-destructive refresh path (e.g. middleware)
 * can treat such a token as still-authenticated instead of forcing logout.
 */
export function hasAuthenticatedKloelIdentity(
  payloadOrToken?: KloelTokenPayload | string | null,
): boolean {
  const payload =
    typeof payloadOrToken === 'string'
      ? decodeKloelJwtPayload(payloadOrToken)
      : (payloadOrToken ?? null);
  if (!payload) {
    return false;
  }

  const hasIdentity = Boolean(
    String(payload.sub || '').trim() && String(payload.email || '').trim(),
  );

  return hasIdentity && !isAnonymousKloelPayload(payload);
}
