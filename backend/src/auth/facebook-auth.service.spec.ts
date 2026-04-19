import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FacebookAuthService } from './facebook-auth.service';

describe('FacebookAuthService', () => {
  const fetchMock = jest.spyOn(global, 'fetch');

  afterEach(() => {
    fetchMock.mockReset();
  });

  const buildService = (options?: {
    appId?: string;
    appSecret?: string;
    publicAppId?: string;
    version?: string;
  }) =>
    new FacebookAuthService({
      get: jest.fn((key: string) => {
        if (key === 'META_APP_ID') return options?.appId ?? '1234567890';
        if (key === 'META_APP_SECRET') return options?.appSecret ?? 'super-secret';
        if (key === 'NEXT_PUBLIC_META_APP_ID') return options?.publicAppId;
        if (key === 'META_GRAPH_API_VERSION') return options?.version ?? 'v21.0';
        return undefined;
      }),
    } as unknown as ConfigService);

  it('validates a Facebook user access token and returns a trusted profile', async () => {
    const service = buildService();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            app_id: '1234567890',
            user_id: 'facebook-user-123',
            is_valid: true,
            type: 'USER',
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'facebook-user-123',
          name: 'Meta User',
          email: 'MetaUser@example.com',
          picture: { data: { url: 'https://example.com/meta-user.png' } },
        }),
      } as Response);

    const profile = await service.verifyAccessToken('user-access-token');

    expect(profile).toEqual({
      provider: 'facebook',
      providerId: 'facebook-user-123',
      email: 'metauser@example.com',
      name: 'Meta User',
      image: 'https://example.com/meta-user.png',
      emailVerified: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/debug_token?'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/me?'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fails when Meta app credentials are not configured', async () => {
    const service = buildService({ appId: '', appSecret: '' });

    await expect(service.verifyAccessToken('user-access-token')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails when debug_token says the token is invalid for this app', async () => {
    const service = buildService();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          app_id: 'different-app',
          user_id: 'facebook-user-123',
          is_valid: false,
        },
      }),
    } as Response);

    await expect(service.verifyAccessToken('user-access-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('fails when Facebook profile does not expose an email address', async () => {
    const service = buildService();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            app_id: '1234567890',
            user_id: 'facebook-user-123',
            is_valid: true,
            type: 'USER',
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'facebook-user-123',
          name: 'Meta User',
        }),
      } as Response);

    await expect(service.verifyAccessToken('user-access-token')).rejects.toThrow(
      BadRequestException,
    );
  });
});
