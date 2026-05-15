import { ConfigService } from '@nestjs/config';
import { createSign, createVerify, generateKeyPairSync, type JsonWebKey } from 'node:crypto';
import { AppleAuthService, buildClientSecret } from './apple-auth.service';

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

  it('builds an Apple client secret with ES256 claims for operational validation', () => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const applePrivateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const clientSecret = buildClientSecret({
      clientId,
      keyId: testKeyId,
      privateKey: applePrivateKey,
      teamId: 'TEAMKLOEL1',
    });
    const [encodedHeader, encodedPayload, encodedSignature] = clientSecret.split('.');

    expect(encodedHeader).toBeDefined();
    expect(encodedPayload).toBeDefined();
    expect(encodedSignature).toBeDefined();
    expect(JSON.parse(Buffer.from(encodedHeader || '', 'base64url').toString('utf8'))).toEqual({
      alg: 'ES256',
      kid: testKeyId,
    });
    expect(JSON.parse(Buffer.from(encodedPayload || '', 'base64url').toString('utf8'))).toEqual(
      expect.objectContaining({
        aud: 'https://appleid.apple.com',
        iss: 'TEAMKLOEL1',
        sub: clientId,
      }),
    );

    const verifier = createVerify('SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    expect(
      verifier.verify(
        { key: pair.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(encodedSignature || '', 'base64url'),
      ),
    ).toBe(true);
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

  it('rejects authorization code exchange for unregistered redirect uris', async () => {
    const service = buildService({
      APPLE_CLIENT_ID: clientId,
      APPLE_CLIENT_SECRET: 'static-secret',
      APPLE_CALLBACK_URL: 'https://auth.kloel.com/api/auth/callback/apple',
    });

    await expect(
      service.verifyAuthorizationCode({
        code: 'apple-code',
        redirectUri: 'https://attacker.example.com/api/auth/callback/apple',
      }),
    ).rejects.toThrow('Redirect URI Apple nao autorizado.');
    const tokenCalls = jest
      .mocked(globalThis.fetch)
      .mock.calls.filter(([url]) => url === 'https://appleid.apple.com/auth/token');
    expect(tokenCalls).toHaveLength(0);
  });

  it('allows authorization code exchange only through configured Apple callback urls', async () => {
    const service = buildService({
      APPLE_CLIENT_ID: clientId,
      APPLE_CLIENT_SECRET: 'static-secret',
      APPLE_CALLBACK_URL: 'https://auth.kloel.com/api/auth/callback/apple',
    });
    const token = signJwt({
      privateKey,
      kid: testKeyId,
      payload: {
        iss: 'https://appleid.apple.com',
        aud: clientId,
        sub: 'apple-user-2',
        iat: Math.floor(Date.now() / 1000) - 10,
        exp: Math.floor(Date.now() / 1000) + 600,
      },
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url === 'https://appleid.apple.com/auth/token') {
        return new Response(JSON.stringify({ id_token: token }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === 'https://appleid.apple.com/auth/keys') {
        return new Response(
          JSON.stringify({ keys: [{ ...publicJwk, kid: testKeyId, alg: 'RS256' }] }),
        );
      }
      return new Response(JSON.stringify({ error: 'unexpected_url' }), { status: 500 });
    });

    const result = await service.verifyAuthorizationCode({
      code: 'apple-code',
      redirectUri: 'https://auth.kloel.com/api/auth/callback/apple',
    });

    expect(result.payload.sub).toBe('apple-user-2');
  });
});
