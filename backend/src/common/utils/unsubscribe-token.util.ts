import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_SEPARATOR = '.';
const TOKEN_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

function getSecret(): string {
  return (
    String(process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || '').trim() ||
    'kloel-unsubscribe-dev-secret'
  );
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

function hmac(data: string): Buffer {
  const secret = getSecret();
  return createHmac('sha256', secret).update(data).digest();
}

export interface UnsubscribePayload {
  email: string;
  workspaceId?: string;
  campaignId?: string;
}

/** Generate a signed unsubscribe token for a given email and optional context. */
export function generateUnsubscribeToken(payload: UnsubscribePayload): string {
  const now = Date.now();
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ exp: now + TOKEN_EXPIRY_MS })));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = base64UrlEncode(hmac(`${header}${TOKEN_SEPARATOR}${body}`));
  return `${header}${TOKEN_SEPARATOR}${body}${TOKEN_SEPARATOR}${signature}`;
}

/** Verify a signed unsubscribe token and return the decoded payload, or null if invalid/expired. */
export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    const parts = token.split(TOKEN_SEPARATOR);
    if (parts.length !== 3) return null;

    const [headerB64, bodyB64, signatureB64] = parts;
    const expectedSig = base64UrlDecode(signatureB64);
    const actualSig = hmac(`${headerB64}${TOKEN_SEPARATOR}${bodyB64}`);

    if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }

    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { exp: number };
    if (!header.exp || Date.now() > header.exp) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(bodyB64).toString('utf8')) as UnsubscribePayload;
    if (!payload.email || typeof payload.email !== 'string') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
