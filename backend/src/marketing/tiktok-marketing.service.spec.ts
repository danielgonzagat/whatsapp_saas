import type { PrismaService } from '../prisma/prisma.service';
import { TikTokMarketingService } from './tiktok-marketing.service';

describe('TikTokMarketingService', () => {
  const originalEnv = process.env;
  let prisma: { workspace: { findUnique: jest.Mock; update: jest.Mock } };
  let service: TikTokMarketingService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
    delete process.env.TIKTOK_APP_ID;
    delete process.env.TIKTOK_APP_SECRET;
    delete process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
    delete process.env.NEXT_PUBLIC_TIKTOK_APP_ID;

    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    service = new TikTokMarketingService(prisma as never as PrismaService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts app id and app secret aliases for production TikTok auth', async () => {
    process.env.TIKTOK_APP_ID = 'test-tiktok-app-id';
    process.env.TIKTOK_APP_SECRET = 'test-secret';
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.FRONTEND_URL = 'https://app.kloel.com';

    const status = await service.getStatus('workspace-1');
    const { url, redirectUri } = service.generateAuthUrl('workspace-1', 'creator');
    const authUrl = new URL(url);

    expect(status.clientConfigured).toBe(true);
    expect(status.secretConfigured).toBe(true);
    expect(authUrl.hostname).toBe('www.tiktok.com');
    expect(authUrl.searchParams.get('client_key')).toBe('test-tiktok-app-id');
    expect(redirectUri).toBe('https://app.kloel.com/integrations/tiktok/auth/callback');
  });

  it('reads creator profile through the official TikTok user info endpoint', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { tiktok: { connected: true, accessToken: 'creator-token' } },
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { user: { open_id: 'open-1', display_name: 'Kloel' } },
          error: { code: 'ok', message: '' },
        }),
        { status: 200 },
      ),
    );

    const result = await service.getCreatorProfile('workspace-1');

    expect(result).toEqual({
      status: 'ok',
      profile: { open_id: 'open-1', display_name: 'Kloel' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('https://open.tiktokapis.com/v2/user/info/'),
      }),
      expect.objectContaining({ headers: { Authorization: 'Bearer creator-token' } }),
    );
  });

  it('lists advertiser campaigns through TikTok Business API without mutating campaigns', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        tiktok: {
          connected: true,
          accessToken: 'advertiser-token',
          advertiserIds: ['1234567890'],
        },
      },
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: 'OK',
          data: { list: [{ campaign_id: 'cmp-1', campaign_name: 'Oferta' }] },
        }),
        { status: 200 },
      ),
    );

    const result = await service.listAdvertiserCampaigns('workspace-1');

    expect(result).toEqual({
      status: 'ok',
      advertiserId: '1234567890',
      campaigns: [{ campaign_id: 'cmp-1', campaign_name: 'Oferta' }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining(
          'https://business-api.tiktok.com/open_api/v1.3/campaign/get/',
        ),
      }),
      expect.objectContaining({
        headers: { 'Access-Token': 'advertiser-token', 'Content-Type': 'application/json' },
      }),
    );
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });
});
