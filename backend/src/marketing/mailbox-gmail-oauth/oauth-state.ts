import { createHmac, timingSafeEqual } from 'node:crypto';
import { STATE_TTL_MS } from './constants';
import type { SignedGmailState } from './types';

export function normalizeReturnTo(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/marketing/email';
  }
  return raw.slice(0, 200);
}

export function expiresAtFromSeconds(seconds: unknown): Date | null {
  const parsed = Number(seconds || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return new Date(Date.now() + parsed * 1000);
}

export function signState(payload: SignedGmailState, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyState(
  rawState: string,
  secret: string,
): SignedGmailState | null {
  const [encoded, signature] = String(rawState || '').split('.');
  if (!encoded || !signature) {
    return null;
  }

  const expected = createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<SignedGmailState>;
    const workspaceId = String(parsed.workspaceId || '').trim();
    const returnTo = normalizeReturnTo(parsed.returnTo);
    const ts = Number(parsed.ts || 0);
    if (!workspaceId || !Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) {
      return null;
    }
    return { workspaceId, returnTo, ts };
  } catch {
    return null;
  }
}
