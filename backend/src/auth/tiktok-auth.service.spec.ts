import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { TikTokAuthService } from './tiktok-auth.service';

describe('TikTokAuthService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createConfig() {
    return {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          TIKTOK_CLIENT_KEY: 'tiktok-client-key',
          TIKTOK_CLIENT_SECRET: 'tiktok-client-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
  }

  it('exchanges the code and enriches the profile with user info when available', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'tt-access-token',
          refresh_token: 'tt-refresh-token',
          expires_in: 3600,
          open_id: 'tt-open-id',
          scope: 'user.info.basic',
          token_type: 'Bearer',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            user: {
              open_id: 'tt-open-id',
              union_id: 'tt-union-id',
              display_name: 'TikTok Creator',
              avatar_url: 'https://cdn.example.com/avatar.jpg',
            },
          },
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const service = new TikTokAuthService(createConfig());
    const profile = await service.verifyAuthorizationCode(
      'auth-code',
      'https://auth.kloel.com/api/auth/callback/tiktok',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://open.tiktokapis.com/v2/oauth/token/',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer tt-access-token',
        },
      }),
    );
    expect(profile).toMatchObject({
      provider: 'tiktok',
      providerId: 'tt-open-id',
      email: 'tiktok-tt-open-id@oauth.kloel.local',
      name: 'TikTok Creator',
      image: 'https://cdn.example.com/avatar.jpg',
      emailVerified: false,
      syntheticEmail: true,
      accessToken: 'tt-access-token',
      refreshToken: 'tt-refresh-token',
    });
  });

  it('falls back to open_id when user info is unavailable', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'tt-access-token',
          expires_in: 3600,
          open_id: 'tt-open-id-2',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'insufficient scope',
          },
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const service = new TikTokAuthService(createConfig());
    const profile = await service.verifyAuthorizationCode(
      'auth-code',
      'https://auth.kloel.com/api/auth/callback/tiktok',
    );

    expect(profile).toMatchObject({
      provider: 'tiktok',
      providerId: 'tt-open-id-2',
      email: 'tiktok-tt-open-id-2@oauth.kloel.local',
      name: 'TikTok User',
      image: null,
      emailVerified: false,
    });
  });

  it('requires user info validation when authenticating from an access token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'invalid access token',
        },
      }),
    }) as typeof fetch;

    const service = new TikTokAuthService(createConfig());

    await expect(
      service.verifyAccessToken({
        accessToken: 'invalid-token',
        openId: 'tt-open-id-3',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('fails clearly when TikTok is not configured', async () => {
    const config = {
      get: jest.fn(() => ''),
    } as unknown as ConfigService;

    const service = new TikTokAuthService(config);

    await expect(
      service.verifyAuthorizationCode(
        'auth-code',
        'https://auth.kloel.com/api/auth/callback/tiktok',
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects invalid or expired authorization codes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'authorization code expired',
      }),
    }) as typeof fetch;

    const service = new TikTokAuthService(createConfig());

    await expect(
      service.verifyAuthorizationCode(
        'expired-code',
        'https://auth.kloel.com/api/auth/callback/tiktok',
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
