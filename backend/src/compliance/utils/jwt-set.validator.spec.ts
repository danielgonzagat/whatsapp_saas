import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwtSetValidator } from './jwt-set.validator';

function buildFetchResponse(keys: Record<string, unknown>[]) {
  return {
    ok: true,
    json: async () => ({ keys }),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'cache-control' ? 'public, max-age=300' : null,
    },
  } as Response;
}

describe('JwtSetValidator', () => {
  const originalFetch = global.fetch;
  const audience = 'google-client-id.apps.googleusercontent.com';
  let validator: JwtSetValidator;

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;

  beforeEach(() => {
    validator = new JwtSetValidator({
      get: jest.fn((key: string) => (key === 'GOOGLE_CLIENT_ID' ? audience : undefined)),
    } as unknown as ConfigService);

    global.fetch = jest.fn(async () =>
      buildFetchResponse([
        {
          ...publicJwk,
          kid: 'test-key',
          kty: 'RSA',
          alg: 'RS256',
          use: 'sig',
        },
      ]),
    ) as typeof global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function signToken(overrides: Record<string, unknown> = {}, key = privateKey) {
    return jwt.sign(
      {
        sub: 'google-subject-123',
        events: {
          'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked': {
            subject: { sub: 'google-subject-123' },
          },
        },
        ...overrides,
      },
      key,
      {
        algorithm: 'RS256',
        issuer: 'https://accounts.google.com',
        audience,
        expiresIn: '5m',
        header: { kid: 'test-key', alg: 'RS256' },
      } as jwt.SignOptions,
    );
  }

  it('validates a signed SET JWT', async () => {
    const token = signToken();
    await expect(validator.validate(token)).resolves.toMatchObject({
      sub: 'google-subject-123',
    });
  });

  it('rejects a JWT with wrong issuer', async () => {
    const token = jwt.sign({ sub: 'google-subject-123', events: {} }, privateKey, {
      algorithm: 'RS256',
      issuer: 'https://malicious.example.com',
      audience,
      expiresIn: '5m',
      header: { kid: 'test-key', alg: 'RS256' },
    } as jwt.SignOptions);

    await expect(validator.validate(token)).rejects.toThrow();
  });

  it('rejects a JWT with wrong audience', async () => {
    const token = jwt.sign({ sub: 'google-subject-123', events: {} }, privateKey, {
      algorithm: 'RS256',
      issuer: 'https://accounts.google.com',
      audience: 'another-client-id.apps.googleusercontent.com',
      expiresIn: '5m',
      header: { kid: 'test-key', alg: 'RS256' },
    } as jwt.SignOptions);

    await expect(validator.validate(token)).rejects.toThrow();
  });

  it('rejects a JWT with invalid signature', async () => {
    const anotherPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = signToken({}, anotherPair.privateKey);

    await expect(validator.validate(token)).rejects.toThrow();
  });

  it('rejects an expired JWT', async () => {
    const token = jwt.sign({ sub: 'google-subject-123', events: {} }, privateKey, {
      algorithm: 'RS256',
      issuer: 'https://accounts.google.com',
      audience,
      expiresIn: -10,
      header: { kid: 'test-key', alg: 'RS256' },
    } as jwt.SignOptions);

    await expect(validator.validate(token)).rejects.toThrow();
  });
});
