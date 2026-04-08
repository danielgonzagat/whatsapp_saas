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
  const normalized = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  try {
    const decoded =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function decodeKloelJwtPayload(token?: string | null): KloelTokenPayload | null {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  const parts = normalizedToken.split('.');
  if (parts.length < 2) return null;

  const payload = decodeBase64Json(parts[1] || '');
  return payload ? (payload as KloelTokenPayload) : null;
}

export function isAnonymousKloelPayload(payload?: KloelTokenPayload | null): boolean {
  if (!payload) return false;

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

export function isAnonymousKloelToken(token?: string | null): boolean {
  return isAnonymousKloelPayload(decodeKloelJwtPayload(token));
}

export function hasAuthenticatedKloelToken(token?: string | null): boolean {
  const payload = decodeKloelJwtPayload(token);
  if (!payload) return false;

  const hasIdentity = Boolean(
    String(payload.sub || '').trim() && String(payload.email || '').trim(),
  );

  return hasIdentity && !isAnonymousKloelPayload(payload);
}
