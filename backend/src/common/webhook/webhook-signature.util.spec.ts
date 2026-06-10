import { createHmac } from 'node:crypto';
import { verifyHmacSha256Signature } from './webhook-signature.util';

/**
 * Reference implementation: the exact inline formula both Meta webhook
 * controllers used before the util was extracted. The util must match this
 * byte-for-byte.
 */
function legacyMetaSignature(rawBody: Buffer | string, secret: string): string {
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

describe('verifyHmacSha256Signature', () => {
  const secret = 'meta-app-secret';
  const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));

  it('accepts a signature computed with the same secret over the raw body', () => {
    const signature = legacyMetaSignature(body, secret);
    expect(verifyHmacSha256Signature(body, signature, secret)).toBe(true);
  });

  it('mirrors the legacy Meta inline formula byte-for-byte', () => {
    // The header the controller would compute equals our reference, so a
    // signature minted one way verifies the other way and vice-versa.
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyHmacSha256Signature(body, expected, secret)).toBe(true);
    expect(expected).toBe(legacyMetaSignature(body, secret));
  });

  it('rejects a signature minted with a different secret', () => {
    const signature = legacyMetaSignature(body, 'wrong-secret');
    expect(verifyHmacSha256Signature(body, signature, secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = legacyMetaSignature(body, secret);
    const tampered = Buffer.from(JSON.stringify({ object: 'page', entry: [] }));
    expect(verifyHmacSha256Signature(tampered, signature, secret)).toBe(false);
  });

  it('rejects a tampered signature header', () => {
    const signature = legacyMetaSignature(body, secret);
    const tampered = signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a');
    expect(verifyHmacSha256Signature(body, tampered, secret)).toBe(false);
  });

  it('fails closed when the secret is empty', () => {
    const signature = legacyMetaSignature(body, secret);
    expect(verifyHmacSha256Signature(body, signature, '')).toBe(false);
  });

  it('fails closed when the signature header is empty', () => {
    expect(verifyHmacSha256Signature(body, '', secret)).toBe(false);
  });

  it('rejects a bare hex digest without the sha256= prefix', () => {
    const bareHex = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256Signature(body, bareHex, secret)).toBe(false);
  });

  it('hashes a string body as UTF-8, matching a Buffer of the same bytes', () => {
    const stringBody = '{"hello":"world"}';
    const signature = legacyMetaSignature(stringBody, secret);
    expect(verifyHmacSha256Signature(stringBody, signature, secret)).toBe(true);
    expect(verifyHmacSha256Signature(Buffer.from(stringBody), signature, secret)).toBe(true);
  });
});
