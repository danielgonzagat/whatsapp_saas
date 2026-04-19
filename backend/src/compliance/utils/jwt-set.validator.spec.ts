import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTPayload,
} from 'jose';
import { validateSecurityEventToken } from './jwt-set.validator';

async function buildSignedToken(
  overrides?: Partial<JWTPayload>,
  signingKey?: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'],
  kid = 'google-kid-1',
) {
  const privateKey = signingKey || validKeyPair.privateKey;
  return new SignJWT({
    events: {
      'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked': {},
    },
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(overrides?.iss?.toString() || 'https://accounts.google.com')
    .setAudience(overrides?.aud?.toString() || 'google-client-id.apps.googleusercontent.com')
    .setSubject(overrides?.sub?.toString() || 'google-user-123')
    .setIssuedAt()
    .setExpirationTime(typeof overrides?.exp === 'number' ? overrides.exp : '5m')
    .sign(privateKey);
}

let validKeyPair: Awaited<ReturnType<typeof generateKeyPair>>;
let invalidKeyPair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  validKeyPair = await generateKeyPair('RS256');
  invalidKeyPair = await generateKeyPair('RS256');

  const publicJwk = (await exportJWK(validKeyPair.publicKey)) as JWK;
  publicJwk.kid = 'google-kid-1';
  jwks = createLocalJWKSet({ keys: [publicJwk] });
});

describe('validateSecurityEventToken', () => {
  const issuer = 'https://accounts.google.com';
  const audience = 'google-client-id.apps.googleusercontent.com';

  it('accepts a valid Google SET JWT', async () => {
    const token = await buildSignedToken();

    await expect(validateSecurityEventToken(token, { issuer, audience, jwks })).resolves.toEqual(
      expect.objectContaining({
        iss: issuer,
        aud: audience,
        sub: 'google-user-123',
      }),
    );
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await buildSignedToken({ iss: 'https://evil.example.com' });

    await expect(validateSecurityEventToken(token, { issuer, audience, jwks })).rejects.toThrow(
      'Invalid Google RISC issuer.',
    );
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await buildSignedToken({ aud: 'other-client-id.apps.googleusercontent.com' });

    await expect(validateSecurityEventToken(token, { issuer, audience, jwks })).rejects.toThrow(
      'Invalid Google RISC audience.',
    );
  });

  it('rejects a token signed with the wrong key', async () => {
    const token = await buildSignedToken({}, invalidKeyPair.privateKey);

    await expect(validateSecurityEventToken(token, { issuer, audience, jwks })).rejects.toThrow(
      'Invalid Google RISC signature.',
    );
  });

  it('rejects an expired token', async () => {
    const token = await new SignJWT({
      events: {
        'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked': {},
      },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'google-kid-1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('google-user-123')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(validKeyPair.privateKey);

    await expect(validateSecurityEventToken(token, { issuer, audience, jwks })).rejects.toThrow(
      'Expired Google RISC token.',
    );
  });
});
