import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { FacebookAuthService } from './facebook-auth.service';

describe('FacebookAuthService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('prefers dedicated auth app credentials over shared Meta credentials', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          META_AUTH_APP_ID: 'auth-app-id',
          META_AUTH_APP_SECRET: 'auth-app-secret',
          META_APP_ID: 'shared-app-id',
          META_APP_SECRET: 'shared-app-secret',
          META_GRAPH_API_VERSION: 'v21.0',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            is_valid: true,
            app_id: 'auth-app-id',
            user_id: 'facebook-user-1',
            expires_at: 1_900_000_000,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'facebook-user-1',
          email: 'fb-user@kloel.com',
          name: 'FB User',
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const service = new FacebookAuthService(config);
    const profile = await service.verifyAccessToken('token-123', 'facebook-user-1');

    const debugTokenUrl = String(fetchMock.mock.calls[0]?.[0] || '');
    const profileUrl = String(fetchMock.mock.calls[1]?.[0] || '');
    expect(debugTokenUrl).toContain('/debug_token');
    expect(debugTokenUrl).toContain('input_token=token-123');
    expect(debugTokenUrl).toContain('access_token=auth-app-id%7Cauth-app-secret');
    expect(profileUrl).toContain(
      `appsecret_proof=${createHmac('sha256', 'auth-app-secret').update('token-123').digest('hex')}`,
    );
    expect(profile.providerId).toBe('facebook-user-1');
    expect(profile.email).toBe('fb-user@kloel.com');
  });

  it('falls back to shared Meta credentials when dedicated auth credentials are absent', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          META_APP_ID: 'shared-app-id',
          META_APP_SECRET: 'shared-app-secret',
          META_GRAPH_API_VERSION: 'v21.0',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            is_valid: true,
            app_id: 'shared-app-id',
            user_id: 'facebook-user-2',
            expires_at: 1_900_000_000,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'facebook-user-2',
          email: 'fb-shared@kloel.com',
          name: 'FB Shared',
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const service = new FacebookAuthService(config);
    const profile = await service.verifyAccessToken('token-456', 'facebook-user-2');

    const debugTokenUrl = String(fetchMock.mock.calls[0]?.[0] || '');
    expect(debugTokenUrl).toContain('access_token=shared-app-id%7Cshared-app-secret');
    expect(profile.providerId).toBe('facebook-user-2');
    expect(profile.email).toBe('fb-shared@kloel.com');
  });

  it('returns a permission-specific error when Facebook does not grant email scope', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          META_AUTH_APP_ID: 'auth-app-id',
          META_AUTH_APP_SECRET: 'auth-app-secret',
          META_GRAPH_API_VERSION: 'v21.0',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            is_valid: true,
            app_id: 'auth-app-id',
            user_id: 'facebook-user-3',
            scopes: ['public_profile'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'facebook-user-3',
          name: 'FB No Email',
        }),
      }) as typeof fetch;

    const service = new FacebookAuthService(config);

    await expect(service.verifyAccessToken('token-789', 'facebook-user-3')).rejects.toThrow(
      'O Facebook não liberou a permissão de email para este login. Autorize a permissão de email e tente novamente.',
    );
  });
});
