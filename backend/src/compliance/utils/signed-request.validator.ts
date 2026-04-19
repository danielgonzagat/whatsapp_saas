import { createHmac } from 'node:crypto';
import { safeCompareStrings } from '../../common/utils/crypto-compare.util';

export interface SignedRequestPayload {
  algorithm?: string;
  user_id?: string;
  [key: string]: unknown;
}

function decodeBase64Url(segment: string) {
  const normalized = String(segment || '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  if (!normalized) {
    throw new Error('Malformed Meta signed_request.');
  }

  const padding = normalized.length % 4;
  const withPadding = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), '=');

  try {
    return Buffer.from(withPadding, 'base64');
  } catch {
    throw new Error('Malformed Meta signed_request payload.');
  }
}

function encodeBase64Url(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function validateSignedRequest(
  signedRequest: string,
  appSecret: string,
): SignedRequestPayload {
  const [encodedSignature, encodedPayload, ...rest] = String(signedRequest || '').split('.');
  if (!encodedSignature || !encodedPayload || rest.length > 0) {
    throw new Error('Malformed Meta signed_request.');
  }

  if (!appSecret?.trim()) {
    throw new Error('Meta App Secret is required.');
  }

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as SignedRequestPayload;
  } catch {
    throw new Error('Malformed Meta signed_request payload.');
  }

  if (String(payload.algorithm || '').toUpperCase() !== 'HMAC-SHA256') {
    throw new Error('Unsupported Meta signed_request algorithm.');
  }

  const expectedSignature = encodeBase64Url(
    createHmac('sha256', appSecret).update(encodedPayload).digest(),
  );

  if (!safeCompareStrings(encodedSignature, expectedSignature)) {
    throw new Error('Invalid Meta signed_request signature.');
  }

  return payload;
}
