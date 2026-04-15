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

  const buildService = (options?: {
    clientId?: string;
    publicClientId?: string;
    allowedClientIds?: string;
  }) =>
    new GoogleAuthService({
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') {
          return options?.clientId ?? 'google-client-id.apps.googleusercontent.com';
        }
        if (key === 'NEXT_PUBLIC_GOOGLE_CLIENT_ID') {
          return options?.publicClientId;
        }
        if (key === 'GOOGLE_ALLOWED_CLIENT_IDS') {
          return options?.allowedClientIds;
        }
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
    const service = buildService({ clientId: '' });

    await expect(service.verifyCredential('credential')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should fail when token audience does not match configured client id', async () => {
    const service = buildService();

    verifyIdTokenMock.mockRejectedValue(new Error('Wrong recipient'));

    await expect(service.verifyCredential('credential')).rejects.toThrow(UnauthorizedException);
  });

  it('should fail when oauth client rejects the credential', async () => {
    const service = buildService();

    verifyIdTokenMock.mockRejectedValue(new Error('Wrong recipient'));

    await expect(service.verifyCredential('credential')).rejects.toThrow(UnauthorizedException);
  });

  it('should fail closed when google verification infra is unavailable', async () => {
    const service = buildService();

    verifyIdTokenMock.mockRejectedValue(new Error('network timeout'));

    await expect(service.verifyCredential('credential')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('accepts NEXT_PUBLIC_GOOGLE_CLIENT_ID when GOOGLE_CLIENT_ID is absent', async () => {
    const service = buildService({
      clientId: '',
      publicClientId: 'public-client-id.apps.googleusercontent.com',
    });

    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        aud: 'public-client-id.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'google-user-123',
        email: 'GoogleUser@example.com',
        email_verified: true,
        name: 'Google User',
      }),
    });

    await service.verifyCredential('valid-google-credential');

    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'valid-google-credential',
      audience: ['public-client-id.apps.googleusercontent.com'],
    });
  });

  it('merges and deduplicates GOOGLE_ALLOWED_CLIENT_IDS with direct ids', async () => {
    const service = buildService({
      clientId: 'prod.apps.googleusercontent.com',
      publicClientId: 'preview.apps.googleusercontent.com',
      allowedClientIds: 'preview.apps.googleusercontent.com, local.apps.googleusercontent.com',
    });

    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        aud: 'local.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'google-user-456',
        email: 'local@example.com',
        email_verified: true,
        name: 'Local User',
      }),
    });

    await service.verifyCredential('valid-google-credential');

    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'valid-google-credential',
      audience: [
        'prod.apps.googleusercontent.com',
        'preview.apps.googleusercontent.com',
        'local.apps.googleusercontent.com',
      ],
    });
  });

  it('fetches phone and address from Google People API when extra scopes were granted', async () => {
    const service = buildService();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        emailAddresses: [{ value: 'googleuser@example.com', metadata: { primary: true } }],
        phoneNumbers: [{ canonicalForm: '+5562999990000', metadata: { primary: true } }],
        addresses: [
          {
            streetAddress: 'Rua das Flores, 100',
            city: 'Caldas Novas',
            region: 'GO',
            postalCode: '75690-000',
            countryCode: 'BR',
            formattedValue: 'Rua das Flores, 100, Caldas Novas - GO',
            metadata: { primary: true },
          },
        ],
      }),
      text: async () => '',
    } as Response);

    const profile = await service.fetchPeopleProfile('access-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('people.googleapis.com/v1/people/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(profile).toMatchObject({
      email: 'googleuser@example.com',
      phone: '+5562999990000',
      address: {
        street: 'Rua das Flores, 100',
        city: 'Caldas Novas',
        state: 'GO',
        postalCode: '75690-000',
        countryCode: 'BR',
      },
    });
  });
});
