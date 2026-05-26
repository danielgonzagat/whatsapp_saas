import { TikTokMarketingService } from './tiktok-marketing.service';

jest.mock('../meta/meta-token-crypto', () => ({
  decryptMetaToken: jest.fn().mockImplementation((token: string | null) => token),
  encryptMetaToken: jest.fn().mockImplementation((token: string) => `encrypted:${token}`),
}));

jest.mock('../whatsapp/provider-settings.types', () => ({
  asProviderSettings: jest.fn().mockImplementation((val: unknown) => val ?? {}),
}));

function setEnv(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
}

function deleteEnv(keys: string[]) {
  for (const key of keys) {
    delete process.env[key];
  }
}

describe('TikTokMarketingService', () => {
  const workspaceFindUnique = jest.fn();
  const workspaceUpdate = jest.fn();

  let service: TikTokMarketingService;
  let fetchSpy: jest.SpyInstance;
  let encryptMetaToken: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no fetch mock configured'));

    const cryptoMock: {
      encryptMetaToken: jest.Mock;
    } = jest.requireMock('../meta/meta-token-crypto');
    encryptMetaToken = cryptoMock.encryptMetaToken;

    setEnv({
      TIKTOK_CLIENT_KEY: 'tk-client-key',
      TIKTOK_CLIENT_SECRET: 'tk-client-secret',
      TIKTOK_STATE_SECRET: 'state-secret-test-32-chars!!',
      FRONTEND_URL: 'https://app.kloel.test',
    });

    workspaceFindUnique.mockResolvedValue({
      providerSettings: { tiktok: {} },
    });
    workspaceUpdate.mockResolvedValue({});

    service = new TikTokMarketingService({
      workspace: {
        findUnique: workspaceFindUnique,
        update: workspaceUpdate,
      },
    } as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    deleteEnv([
      'TIKTOK_CLIENT_KEY',
      'TIKTOK_CLIENT_SECRET',
      'TIKTOK_STATE_SECRET',
      'FRONTEND_URL',
      'NEXT_PUBLIC_TIKTOK_CLIENT_KEY',
      'NEXT_PUBLIC_TIKTOK_APP_ID',
      'TIKTOK_APP_ID',
      'TIKTOK_APP_SECRET',
      'TIKTOK_CLIENT_ID',
      'JWT_SECRET',
    ]);
  });

  describe('getStatus', () => {
    it('returns disconnected when no tiktok settings exist', async () => {
      const result = await service.getStatus('ws-1');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('disconnected');
      expect(result.advertiserIds).toEqual([]);
      expect(result.clientConfigured).toBe(true);
    });

    it('returns connected with kind and advertiserIds', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          tiktok: {
            connected: true,
            kind: 'advertiser',
            openId: 'open-123',
            advertiserIds: ['adv-1', 'adv-2'],
            expiresAt: '2026-06-01T00:00:00.000Z',
          },
        },
      });

      const result = await service.getStatus('ws-1');

      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(result.kind).toBe('advertiser');
      expect(result.advertiserIds).toEqual(['adv-1', 'adv-2']);
    });

    it('shows clientConfigured false when env vars are missing', async () => {
      deleteEnv(['TIKTOK_CLIENT_KEY', 'NEXT_PUBLIC_TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']);

      const freshService = new TikTokMarketingService({
        workspace: { findUnique: workspaceFindUnique, update: workspaceUpdate },
      } as never);

      const result = await freshService.getStatus('ws-1');

      expect(result.clientConfigured).toBe(false);
      expect(result.secretConfigured).toBe(false);
    });

    it('accepts app id and app secret aliases for production TikTok auth', async () => {
      deleteEnv([
        'TIKTOK_CLIENT_KEY',
        'TIKTOK_CLIENT_SECRET',
        'TIKTOK_STATE_SECRET',
        'NEXT_PUBLIC_TIKTOK_CLIENT_KEY',
      ]);
      setEnv({
        TIKTOK_APP_ID: '7632164959169806353',
        TIKTOK_APP_SECRET: 'test-secret',
        JWT_SECRET: 'jwt-secret',
      });

      const result = await service.getStatus('ws-1');
      const auth = service.generateAuthUrl('ws-1', 'creator');
      const authUrl = new URL(auth.url);

      expect(result.clientConfigured).toBe(true);
      expect(result.secretConfigured).toBe(true);
      expect(authUrl.hostname).toBe('www.tiktok.com');
      expect(authUrl.searchParams.get('client_key')).toBe('7632164959169806353');
      expect(auth.redirectUri).toBe('https://app.kloel.test/integrations/tiktok/auth/callback');
    });
  });

  describe('generateAuthUrl', () => {
    it('generates a creator auth URL with scopes and signed state', () => {
      const result = service.generateAuthUrl('ws-1', 'creator');
      const url = new URL(result.url);

      expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
      expect(url.searchParams.get('client_key')).toBe('tk-client-key');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toMatch(/^[^.]+\.[^.]+$/);
      expect(result.kind).toBe('creator');
      expect(result.redirectUri).toContain('/integrations/tiktok/auth/callback');
    });

    it('generates an advertiser auth URL', () => {
      const result = service.generateAuthUrl('ws-1', 'advertiser');
      const url = new URL(result.url);

      expect(url.origin + url.pathname).toBe('https://business-api.tiktok.com/portal/auth');
      expect(url.searchParams.get('app_id')).toBe('tk-client-key');
      expect(result.kind).toBe('advertiser');
    });

    it('defaults kind to creator when none specified', () => {
      const result = service.generateAuthUrl('ws-1');

      expect(result.kind).toBe('creator');
    });
  });

  describe('read APIs', () => {
    it('reads creator profile through the official TikTok user info endpoint', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: { tiktok: { connected: true, accessToken: 'creator-token' } },
      });
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { user: { open_id: 'open-1', display_name: 'Kloel' } },
            error: { code: 'ok', message: '' },
          }),
          { status: 200 },
        ),
      );

      const result = await service.getCreatorProfile('ws-1');

      expect(result).toEqual({
        status: 'ok',
        profile: { open_id: 'open-1', display_name: 'Kloel' },
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining('https://open.tiktokapis.com/v2/user/info/'),
        }),
        expect.objectContaining({ headers: { Authorization: 'Bearer creator-token' } }),
      );
    });

    it('lists advertiser campaigns through TikTok Business API without mutating campaigns', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          tiktok: {
            connected: true,
            accessToken: 'advertiser-token',
            advertiserIds: ['1234567890'],
          },
        },
      });
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: 'OK',
            data: { list: [{ campaign_id: 'cmp-1', campaign_name: 'Oferta' }] },
          }),
          { status: 200 },
        ),
      );

      const result = await service.listAdvertiserCampaigns('ws-1');

      expect(result).toEqual({
        status: 'ok',
        advertiserId: '1234567890',
        campaigns: [{ campaign_id: 'cmp-1', campaign_name: 'Oferta' }],
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining(
            'https://business-api.tiktok.com/open_api/v1.3/campaign/get/',
          ),
        }),
        expect.objectContaining({
          headers: { 'Access-Token': 'advertiser-token', 'Content-Type': 'application/json' },
        }),
      );
      expect(workspaceUpdate).not.toHaveBeenCalled();
    });
  });

  describe('completeOAuth', () => {
    it('completes creator OAuth flow successfully and encrypts tokens', async () => {
      const authState = service.generateAuthUrl('ws-1', 'creator').url.match(/state=([^&]+)/)?.[1];

      fetchSpy.mockResolvedValueOnce({
        json: async () => ({
          access_token: 'plain-creator-token',
          refresh_token: 'plain-refresh-token',
          expires_in: 86400,
          open_id: 'open-123',
          scope: 'user.info.basic,video.list',
        }),
      });

      const result = await service.completeOAuth('ws-1', {
        code: 'auth-code-123',
        kind: 'creator',
        state: authState,
      });

      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(encryptMetaToken).toHaveBeenCalledWith('plain-creator-token');
      expect(encryptMetaToken).toHaveBeenCalledWith('plain-refresh-token');
      expect(workspaceUpdate).toHaveBeenCalledTimes(1);
      const [updateCall] = workspaceUpdate.mock.calls[0] as [{ where: { id: string } }];
      expect(updateCall.where.id).toBe('ws-1');
    });

    it('completes advertiser OAuth flow successfully', async () => {
      const authState = service
        .generateAuthUrl('ws-1', 'advertiser')
        .url.match(/state=([^&]+)/)?.[1];

      fetchSpy.mockResolvedValueOnce({
        json: async () => ({
          data: {
            access_token: 'plain-ad-token',
            advertiser_ids: ['adv-1'],
            expires_in: 3600,
          },
        }),
      });

      const result = await service.completeOAuth('ws-1', {
        auth_code: 'ad-code-456',
        kind: 'advertiser',
        state: authState,
      });

      expect(result.connected).toBe(true);
      expect(result.advertiserIds).toEqual(['adv-1']);
    });

    it('returns missing_code when no code is provided', async () => {
      const result = await service.completeOAuth('ws-1', {
        kind: 'creator',
        state: 'arbitrary-state',
      });

      expect(result).toEqual({ connected: false, status: 'missing_code' });
      expect(workspaceUpdate).not.toHaveBeenCalled();
    });

    it('returns invalid_state when state verification fails', async () => {
      const result = await service.completeOAuth('ws-1', {
        code: 'some-code',
        kind: 'creator',
        state: 'tampered-payload.bad-signature',
      });

      expect(result).toEqual({ connected: false, status: 'invalid_state' });
    });

    it('returns server_not_configured when env vars are missing', async () => {
      const authState = service.generateAuthUrl('ws-1', 'creator').url.match(/state=([^&]+)/)?.[1];

      deleteEnv(['TIKTOK_CLIENT_KEY', 'NEXT_PUBLIC_TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']);

      const result = await service.completeOAuth('ws-1', {
        code: 'some-code',
        kind: 'creator',
        state: authState,
      });

      expect(result).toEqual({ connected: false, status: 'server_not_configured' });
    });

    it('returns token_exchange_failed when no access_token in response', async () => {
      const authState = service.generateAuthUrl('ws-1', 'creator').url.match(/state=([^&]+)/)?.[1];

      fetchSpy.mockResolvedValueOnce({
        json: async () => ({
          message: 'Authorization code expired',
          error: 'invalid_grant',
        }),
      });

      const result = await service.completeOAuth('ws-1', {
        code: 'bad-code',
        kind: 'creator',
        state: authState,
      });

      expect(result).toEqual({
        connected: false,
        status: 'token_exchange_failed',
        providerMessage: 'Authorization code expired',
      });
    });
  });

  describe('disconnect', () => {
    it('removes tiktok settings from the workspace', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          tiktok: { connected: true, kind: 'creator' },
          whatsapp: { someSetting: true },
        },
      });

      const result = await service.disconnect('ws-1');

      expect(result).toEqual({ status: 'disconnected' });
      expect(workspaceUpdate).toHaveBeenCalledTimes(1);
    });

    it('handles disconnect when tiktok was never connected', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {},
      });

      const result = await service.disconnect('ws-1');

      expect(result).toEqual({ status: 'disconnected' });
      expect(workspaceUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
