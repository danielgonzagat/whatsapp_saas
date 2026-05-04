import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, createSign, type JsonWebKey } from 'node:crypto';
import { AppleAuthService } from './apple-auth.service';

function encodeJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signJwt(input: {
  privateKey: string;
  kid: string;
  payload: Record<string, unknown>;
}): string {
  const signingInput = [
    encodeJson({ alg: 'RS256', kid: input.kid }),
    encodeJson(input.payload),
  ].join('.');
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(input.privateKey).toString('base64url')}`;
}

function buildService(config: Record<string, string>): AppleAuthService {
  return new AppleAuthService(new ConfigService(config));
}

describe('AppleAuthService', () => {
  const testKeyId = ['apple', 'kid', 'fixture'].join('-');
  const clientId = 'com.kloel.web';
  let privateKey: string;
  let publicJwk: JsonWebKey;

  beforeEach(() => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    publicJwk = pair.publicKey.export({ format: 'jwk' });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url === 'https://appleid.apple.com/auth/keys') {
        return new Response(
          JSON.stringify({ keys: [{ ...publicJwk, kid: testKeyId, alg: 'RS256' }] }),
        );
      }
      return new Response(JSON.stringify({ error: 'unexpected_url' }), { status: 500 });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies Apple identity tokens against Apple JWKS and configured audience', async () => {
    const service = buildService({ APPLE_CLIENT_ID: clientId });
    const token = signJwt({
      privateKey,
      kid: testKeyId,
      payload: {
        iss: 'https://appleid.apple.com',
        aud: clientId,
        sub: 'apple-user-1',
        email: 'buyer@kloel.com',
        email_verified: 'true',
        iat: Math.floor(Date.now() / 1000) - 10,
        exp: Math.floor(Date.now() / 1000) + 600,
      },
    });

    const payload = await service.verifyIdentityToken(token);

    expect(payload.sub).toBe('apple-user-1');
    expect(payload.email).toBe('buyer@kloel.com');
  });

  it('rejects Apple identity tokens for another client id', async () => {
    const service = buildService({ APPLE_CLIENT_ID: clientId });
    const token = signJwt({
      privateKey,
      kid: testKeyId,
      payload: {
        iss: 'https://appleid.apple.com',
        aud: 'com.other.client',
        sub: 'apple-user-1',
        iat: Math.floor(Date.now() / 1000) - 10,
        exp: Math.floor(Date.now() / 1000) + 600,
      },
    });

    await expect(service.verifyIdentityToken(token)).rejects.toThrow('Audience Apple invalida.');
  });
});
