import { Test } from '@nestjs/testing';
import { TikTokAdsProvider } from './tiktok-ads.provider';
import { PrismaService } from '../prisma/prisma.service';
import { TikTokAdsService } from '../marketing/tiktok-ads.service';

describe('TikTokAdsProvider', () => {
  let provider: TikTokAdsProvider;
  let prismaService: jest.Mocked<PrismaService>;
  let tiktokAdsService: jest.Mocked<TikTokAdsService>;

  const workspaceId = 'ws-test-123';

  beforeEach(async () => {
    tiktokAdsService = {
      getCampaignsForAdvertiser: jest.fn(),
      getReport: jest.fn(),
      getAccessTokenAndAdvertiserIds: jest.fn(),
    } as unknown as jest.Mocked<TikTokAdsService>;

    prismaService = {
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        TikTokAdsProvider,
        { provide: PrismaService, useValue: prismaService },
        { provide: TikTokAdsService, useValue: tiktokAdsService },
      ],
    }).compile();

    provider = module.get<TikTokAdsProvider>(TikTokAdsProvider);
  });

  describe('connect', () => {
    it('should return pending_oauth with authUrl when app ID is configured', async () => {
      process.env.TIKTOK_CLIENT_KEY = 'test-app-id';

      const result = await provider.connect(workspaceId, 'https://example.com/callback');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('pending_oauth');
      expect(result.authUrl).toContain('business-api.tiktok.com');
      expect(result.authUrl).toContain('test-app-id');

      delete process.env.TIKTOK_CLIENT_KEY;
    });

    it('should return not_configured when no app ID is set', async () => {
      const result = await provider.connect(workspaceId, 'https://example.com/callback');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('tiktok_app_id_not_configured');
    });
  });

  describe('getStatus', () => {
    it('should return connected status when provider settings exist', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: {
          tiktok: {
            connected: true,
            status: 'connected',
            advertiserIds: ['adv-1'],
            connectedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      });

      const result = await provider.getStatus(workspaceId);

      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(result.accountId).toBe('adv-1');
    });

    it('should return disconnected status when not connected', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: { tiktok: {} },
      });

      const result = await provider.getStatus(workspaceId);

      expect(result.connected).toBe(false);
      expect(result.status).toBe('disconnected');
    });
  });

  describe('syncAccounts', () => {
    it('should return accounts from provider settings', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: {
          tiktok: {
            connected: true,
            advertiserIds: ['adv-1', 'adv-2'],
          },
        },
      });

      const result = await provider.syncAccounts(workspaceId);

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0].platform).toBe('tiktok');
      expect(result.accounts[0].accountId).toBe('adv-1');
    });

    it('should return empty accounts when not connected', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: { tiktok: {} },
      });

      const result = await provider.syncAccounts(workspaceId);

      expect(result.accounts).toHaveLength(0);
    });
  });

  describe('syncCampaigns', () => {
    it('should return campaigns from the TikTok API', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: {
          tiktok: {
            connected: true,
            accessToken: 'encrypted-test-token',
            advertiserIds: ['adv-1'],
          },
        },
      });
      tiktokAdsService.getCampaignsForAdvertiser.mockResolvedValue([
        {
          campaignId: 'camp-1',
          campaignName: 'Test Campaign',
          advertiserId: 'adv-1',
          status: 'ENABLED',
        },
      ]);

      const result = await provider.syncCampaigns(workspaceId);

      expect(result.campaigns).toHaveLength(1);
      expect(result.campaigns[0].campaignId).toBe('camp-1');
      expect(result.campaigns[0].platform).toBe('tiktok');
    });

    it('should return empty campaigns when auth fails', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: {},
      });

      const result = await provider.syncCampaigns(workspaceId);

      expect(result.campaigns).toHaveLength(0);
    });
  });

  describe('disconnect', () => {
    it('should return already_disconnected when not connected', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: { tiktok: {} },
      });

      const result = await provider.disconnect(workspaceId);

      expect(result.status).toBe('already_disconnected');
    });
  });
});
