import { BadRequestException } from '@nestjs/common';
import { extractAppleIdentityProfile } from './apple-identity';

function createIdentityToken(payload: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}

describe('extractAppleIdentityProfile', () => {
  it('extracts the Apple identity payload and first-consent profile fields', () => {
    const profile = extractAppleIdentityProfile(
      createIdentityToken({
        sub: 'apple-user-123',
        email: 'ana@kloel.com',
        email_verified: 'true',
      }),
      {
        name: {
          firstName: 'Ana',
          lastName: 'Silva',
        },
      },
    );

    expect(profile).toEqual({
      provider: 'apple',
      providerId: 'apple-user-123',
      email: 'ana@kloel.com',
      name: 'Ana Silva',
      image: null,
      emailVerified: true,
    });
  });

  it('falls back to a private relay email and derived display name when Apple omits first-consent data', () => {
    const profile = extractAppleIdentityProfile(
      createIdentityToken({
        sub: 'apple-user-456',
      }),
    );

    expect(profile.email).toBe('apple-user-456@privaterelay.appleid.com');
    expect(profile.name).toBe('Apple user 456');
    expect(profile.emailVerified).toBe(false);
  });

  it('rejects malformed Apple identity tokens', () => {
    expect(() => extractAppleIdentityProfile('not-a-jwt')).toThrow(BadRequestException);
  });
});
