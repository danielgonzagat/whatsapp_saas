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
    process.env.TIKTOK_APP_ID = '7632164959169806353';
    process.env.TIKTOK_APP_SECRET = 'test-secret';
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.FRONTEND_URL = 'https://app.kloel.com';

    const status = await service.getStatus('workspace-1');
    const { url, redirectUri } = service.generateAuthUrl('workspace-1', 'creator');
    const authUrl = new URL(url);

    expect(status.clientConfigured).toBe(true);
    expect(status.secretConfigured).toBe(true);
    expect(authUrl.hostname).toBe('www.tiktok.com');
    expect(authUrl.searchParams.get('client_key')).toBe('7632164959169806353');
    expect(redirectUri).toBe('https://app.kloel.com/integrations/tiktok/auth/callback');
  });
});
