import { createHmac } from 'node:crypto';
import { validateSignedRequest } from './signed-request.validator';

function encodeBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('validateSignedRequest', () => {
  const appSecret = 'meta-app-secret';

  it('accepts a valid signed_request payload', () => {
    const payload = {
      algorithm: 'HMAC-SHA256',
      user_id: 'fb-user-123',
      issued_at: 1_713_456_789,
    };
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', appSecret).update(encodedPayload).digest();
    const signedRequest = `${encodeBase64Url(signature)}.${encodedPayload}`;

    expect(validateSignedRequest(signedRequest, appSecret)).toEqual(payload);
  });

  it('rejects an invalid signature', () => {
    const payload = {
      algorithm: 'HMAC-SHA256',
      user_id: 'fb-user-123',
    };
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signedRequest = `${encodeBase64Url('wrong-signature')}.${encodedPayload}`;

    expect(() => validateSignedRequest(signedRequest, appSecret)).toThrow(
      'Invalid Meta signed_request signature.',
    );
  });

  it('rejects malformed base64 payloads', () => {
    expect(() => validateSignedRequest('abc.!not-base64!', appSecret)).toThrow(
      'Malformed Meta signed_request payload.',
    );
  });

  it('rejects signed_request values without a payload', () => {
    expect(() => validateSignedRequest('signature-only', appSecret)).toThrow(
      'Malformed Meta signed_request.',
    );
  });
});
