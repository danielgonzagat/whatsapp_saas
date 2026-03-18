import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { GoogleAuthService, GoogleVerifiedProfile } from './google-auth.service';

const verifyIdTokenMock = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: verifyIdTokenMock,
  })),
}));

describe('GoogleAuthService', () => {
  afterEach(() => {
    verifyIdTokenMock.mockReset();
    jest.restoreAllMocks();
  });

  const buildService = (
    clientId = 'google-client-id.apps.googleusercontent.com',
  ) =>
    new GoogleAuthService({
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return clientId;
        return undefined;
      }),
    } as unknown as ConfigService);

  it('should validate a Google credential and return trusted profile', async () => {
    const service = buildService();

    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        aud: 'google-client-id.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'google-user-123',
        email: 'GoogleUser@example.com',
        email_verified: true,
        name: 'Google User',
        picture: 'https://example.com/avatar.png',
      }),
    });

    const profile = await service.verifyCredential('valid-google-credential');

    expect(profile).toEqual<GoogleVerifiedProfile>({
      provider: 'google',
      providerId: 'google-user-123',
      email: 'googleuser@example.com',
      name: 'Google User',
      image: 'https://example.com/avatar.png',
      emailVerified: true,
    });

    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'valid-google-credential',
      audience: ['google-client-id.apps.googleusercontent.com'],
    });
  });

  it('should fail when Google client id is not configured', async () => {
    const service = buildService('');

    await expect(service.verifyCredential('credential')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should fail when token audience does not match configured client id', async () => {
    const service = buildService();

    verifyIdTokenMock.mockRejectedValue(new Error('Wrong recipient'));

    await expect(service.verifyCredential('credential')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should fail when oauth client rejects the credential', async () => {
    const service = buildService();

    verifyIdTokenMock.mockRejectedValue(new Error('Wrong recipient'));

    await expect(service.verifyCredential('credential')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should fail closed when google verification infra is unavailable', async () => {
    const service = buildService();

    verifyIdTokenMock.mockRejectedValue(new Error('network timeout'));

    await expect(service.verifyCredential('credential')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
