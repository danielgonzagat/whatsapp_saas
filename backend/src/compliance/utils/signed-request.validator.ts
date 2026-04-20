import { createHmac, timingSafeEqual } from 'node:crypto';

/** Facebook signed request payload type. */
export type FacebookSignedRequestPayload = {
  algorithm?: string;
  issued_at?: number;
  user_id?: string;
  [key: string]: unknown;
};

function toBase64(input: string) {
  return input.replace(/-/g, '+').replace(/_/g, '/');
}

function decodeBase64Url(input: string) {
  const normalized = toBase64(String(input || '').trim());
  const padding = normalized.length % 4;
  const withPadding =
    padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), '=');
  return Buffer.from(withPadding, 'base64');
}

/** Validate signed request. */
export function validateSignedRequest(
  signedRequest: string,
  appSecret: string,
): FacebookSignedRequestPayload {
  const raw = String(signedRequest || '').trim();
  const secret = String(appSecret || '').trim();
  if (!raw) {
    throw new Error('signed_request is required');
  }
  if (!secret) {
    throw new Error('META_APP_SECRET is required');
  }

  const [encodedSignature, encodedPayload, ...rest] = raw.split('.');
  if (!encodedSignature || !encodedPayload || rest.length > 0) {
    throw new Error('Malformed signed_request');
  }

  const providedSignature = decodeBase64Url(encodedSignature);
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new Error('Invalid signed_request signature');
  }

  let payload: FacebookSignedRequestPayload;
  try {
    payload = JSON.parse(
      decodeBase64Url(encodedPayload).toString('utf8'),
    ) as FacebookSignedRequestPayload;
  } catch {
    throw new Error('Malformed signed_request payload');
  }

  const algorithm = String(payload.algorithm || 'HMAC-SHA256').toUpperCase();
  if (algorithm !== 'HMAC-SHA256') {
    throw new Error('Unsupported signed_request algorithm');
  }

  return payload;
}
