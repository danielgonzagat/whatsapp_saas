import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MetaMarketingProvider } from '../integrations/meta-marketing.provider';
import { GoogleAdsProvider } from '../integrations/google-ads.provider';
import { TikTokAdsProvider } from '../integrations/tiktok-ads.provider';
import { AnunciosService } from './anuncios.service';

function makeProvider(platform: string) {
  return {
    platform,
    getStatus: jest.fn().mockResolvedValue({ connected: true, status: 'ok', accountId: 'acc-1' }),
    connect: jest.fn().mockResolvedValue({ authUrl: `https://${platform}.example/auth` }),
    completeOAuth: jest.fn().mockResolvedValue({ connected: true, status: 'connected' }),
    disconnect: jest.fn().mockResolvedValue({ status: 'disconnected' }),
    syncAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
    syncCampaigns: jest.fn().mockResolvedValue({ campaigns: [] }),
  };
}

describe('AnunciosService', () => {
  let service: AnunciosService;
  let prisma: {
    adAccount: { findMany: jest.Mock; upsert: jest.Mock };
    adCampaign: { findMany: jest.Mock; upsert: jest.Mock };
  };
  let meta: ReturnType<typeof makeProvider>;
  let google: ReturnType<typeof makeProvider>;
  let tiktok: ReturnType<typeof makeProvider>;

  beforeEach(async () => {
    prisma = {
      adAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      adCampaign: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    meta = makeProvider('meta');
    google = makeProvider('google');
    tiktok = makeProvider('tiktok');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnunciosService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetaMarketingProvider, useValue: meta },
        { provide: GoogleAdsProvider, useValue: google },
        { provide: TikTokAdsProvider, useValue: tiktok },
      ],
    }).compile();
    service = module.get(AnunciosService);
  });

  it('getPlatformStatuses returns one row per provider', async () => {
    const result = await service.getPlatformStatuses('ws-1');
    expect(result.map((r) => r.platform).sort()).toEqual(['google', 'meta', 'tiktok']);
    expect(result.every((r) => r.connected)).toBe(true);
  });

  it('getPlatformStatuses degrades to error when provider throws', async () => {
    meta.getStatus.mockRejectedValue(new Error('meta down'));
    const result = await service.getPlatformStatuses('ws-1');
    const metaRow = result.find((r) => r.platform === 'meta');
    expect(metaRow?.connected).toBe(false);
    expect(metaRow?.status).toBe('error');
  });

  it('getConnectUrl returns provider authUrl', async () => {
    const result = await service.getConnectUrl('ws-1', 'meta');
    expect(result.authUrl).toBe('https://meta.example/auth');
    expect(meta.connect).toHaveBeenCalledWith('ws-1', expect.stringContaining('callback/meta'));
  });

  it('getConnectUrl returns empty authUrl for unknown platform', async () => {
    const result = await service.getConnectUrl('ws-1', 'mystery');
    expect(result.authUrl).toBe('');
  });

  it('completeOAuth triggers sync only when connection succeeded', async () => {
    meta.completeOAuth.mockResolvedValue({ connected: true, status: 'connected' });
    await service.completeOAuth('ws-1', 'meta', 'code-xyz');
    expect(meta.syncAccounts).toHaveBeenCalled();
    expect(meta.syncCampaigns).toHaveBeenCalled();

    meta.completeOAuth.mockResolvedValue({ connected: false, status: 'denied' });
    meta.syncAccounts.mockClear();
    await service.completeOAuth('ws-1', 'meta', 'code-xyz');
    expect(meta.syncAccounts).not.toHaveBeenCalled();
  });

  it('disconnect returns not_supported for unknown platform', async () => {
    await expect(service.disconnect('ws-1', 'mystery')).resolves.toEqual({
      status: 'not_supported',
    });
  });

  it('getAccounts filters by workspace and optionally by platform', async () => {
    prisma.adAccount.findMany.mockResolvedValue([
      { id: '1', platform: 'meta', accountId: 'a1', accountName: null, status: 'connected' },
    ]);
    await service.getAccounts('ws-tenant-A', 'meta');
    expect(prisma.adAccount.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-tenant-A', platform: 'meta' },
      orderBy: { platform: 'asc' },
    });
  });

  it('getAccounts maps fields including connected flag', async () => {
    prisma.adAccount.findMany.mockResolvedValue([
      {
        id: '1',
        platform: 'meta',
        accountId: 'a1',
        accountName: 'My Account',
        status: 'connected',
      },
      {
        id: '2',
        platform: 'meta',
        accountId: 'a2',
        accountName: null,
        status: 'disconnected',
      },
    ]);
    const result = await service.getAccounts('ws-1');
    expect(result[0].connected).toBe(true);
    expect(result[1].connected).toBe(false);
    expect(result[1].accountName).toBe('a2'); // fallback to accountId when name is null
  });

  it('syncAccounts upserts every account returned by providers, scoped to workspace', async () => {
    meta.syncAccounts.mockResolvedValue({
      accounts: [
        { platform: 'meta', accountId: 'acc-1', accountName: 'Meta Acc' },
      ],
    });
    await service.syncAccounts('ws-1');
    expect(prisma.adAccount.upsert).toHaveBeenCalled();
    const upsertArg = prisma.adAccount.upsert.mock.calls[0][0];
    expect(upsertArg.where.workspaceId_platform_accountId.workspaceId).toBe('ws-1');
    expect(upsertArg.create.status).toBe('connected');
  });

  it('syncCampaigns logs but does not throw when a provider rejects', async () => {
    google.syncCampaigns.mockRejectedValue(new Error('google down'));
    meta.syncCampaigns.mockResolvedValue({
      campaigns: [
        {
          platform: 'meta',
          accountId: 'a1',
          campaignId: 'c1',
          campaignName: 'C',
          status: 'active',
          spend: 100,
          revenue: 300,
          roas: 3,
          conversions: 5,
          impressions: 1000,
          clicks: 50,
          ctr: 0.05,
          cpc: 2,
        },
      ],
    });
    await expect(service.syncCampaigns('ws-1')).resolves.toBeDefined();
    expect(prisma.adCampaign.upsert).toHaveBeenCalled();
  });
});
