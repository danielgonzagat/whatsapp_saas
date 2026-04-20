import { createHmac } from 'node:crypto';
import { validateSignedRequest } from './signed-request.validator';

function encodeBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildSignedRequest(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest();
  return `${encodeBase64Url(signature)}.${encodedPayload}`;
}

describe('validateSignedRequest', () => {
  const secret = 'meta-app-secret';

  it('accepts a valid signed_request', () => {
    const signedRequest = buildSignedRequest(
      {
        algorithm: 'HMAC-SHA256',
        issued_at: 1_713_000_000,
        user_id: 'fb-user-123',
      },
      secret,
    );

    expect(validateSignedRequest(signedRequest, secret)).toEqual({
      algorithm: 'HMAC-SHA256',
      issued_at: 1_713_000_000,
      user_id: 'fb-user-123',
    });
  });

  it('rejects an invalid signature', () => {
    const signedRequest = buildSignedRequest(
      {
        algorithm: 'HMAC-SHA256',
        user_id: 'fb-user-123',
      },
      'wrong-secret',
    );

    expect(() => validateSignedRequest(signedRequest, secret)).toThrow(
      'Invalid signed_request signature',
    );
  });

  it('rejects malformed base64 payloads', () => {
    const encodedPayload = '%%%';
    const signature = createHmac('sha256', secret).update(encodedPayload).digest();
    const signedRequest = `${encodeBase64Url(signature)}.${encodedPayload}`;

    expect(() => validateSignedRequest(signedRequest, secret)).toThrow(
      'Malformed signed_request payload',
    );
  });

  it('rejects missing payloads', () => {
    expect(() => validateSignedRequest('only-signature', secret)).toThrow(
      'Malformed signed_request',
    );
  });
});
