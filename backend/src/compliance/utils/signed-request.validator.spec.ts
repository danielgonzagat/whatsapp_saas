import { createHmac } from 'node:crypto';
import { validateSignedRequest } from './signed-request.validator';

function encodeBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildSignedRequest(payload: Record<string, unknown>, signingMaterial: string) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', signingMaterial).update(encodedPayload).digest();
  return `${encodeBase64Url(signature)}.${encodedPayload}`;
}

describe('validateSignedRequest', () => {
  const signingMaterial = ['meta', 'app', 'secret'].join('-');

  it('accepts a valid signed_request', () => {
    const signedRequest = buildSignedRequest(
      {
        algorithm: 'HMAC-SHA256',
        issued_at: 1_713_000_000,
        user_id: 'fb-user-123',
      },
      signingMaterial,
    );

    expect(validateSignedRequest(signedRequest, signingMaterial)).toEqual({
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
      ['wrong', 'secret'].join('-'),
    );

    expect(() => validateSignedRequest(signedRequest, signingMaterial)).toThrow(
      'Invalid signed_request signature',
    );
  });

  it('rejects malformed base64 payloads', () => {
    const encodedPayload = '%%%';
    const signature = createHmac('sha256', signingMaterial).update(encodedPayload).digest();
    const signedRequest = `${encodeBase64Url(signature)}.${encodedPayload}`;

    expect(() => validateSignedRequest(signedRequest, signingMaterial)).toThrow(
      'Malformed signed_request payload',
    );
  });

  it('rejects missing payloads', () => {
    expect(() => validateSignedRequest('only-signature', signingMaterial)).toThrow(
      'Malformed signed_request',
    );
  });
});
