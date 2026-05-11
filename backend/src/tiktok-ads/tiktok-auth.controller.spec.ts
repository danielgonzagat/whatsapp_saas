import { Test } from '@nestjs/testing';
import { TikTokAuthController } from './tiktok-auth.controller';
import { TikTokAdsProvider } from '../integrations/tiktok-ads.provider';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

describe('TikTokAuthController', () => {
  let controller: TikTokAuthController;
  let tiktokAdsProvider: jest.Mocked<TikTokAdsProvider>;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    tiktokAdsProvider = {
      platform: 'tiktok',
      connect: jest.fn(),
      completeOAuth: jest.fn(),
      getStatus: jest.fn(),
      disconnect: jest.fn(),
      refreshToken: jest.fn(),
      syncAccounts: jest.fn(),
      syncCampaigns: jest.fn(),
      syncInsights: jest.fn(),
    } as unknown as jest.Mocked<TikTokAdsProvider>;

    prismaService = {
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      controllers: [TikTokAuthController],
      providers: [
        { provide: TikTokAdsProvider, useValue: tiktokAdsProvider },
        { provide: PrismaService, useValue: prismaService },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();

    controller = module.get<TikTokAuthController>(TikTokAuthController);
  });

  describe('getAuthUrl', () => {
    it('should return an auth URL from the provider', async () => {
      tiktokAdsProvider.connect.mockResolvedValue({
        connected: false,
        status: 'pending_oauth',
        authUrl: 'https://business-api.tiktok.com/portal/auth?app_id=test',
      });

      const result = await controller.getAuthUrl({ user: { workspaceId: 'ws-1' } } as Parameters<
        typeof controller.getAuthUrl
      >[0]);

      expect(result.authUrl).toContain('business-api.tiktok.com');
      expect(result.returnTo).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('should disconnect and return status', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: { tiktok: { connected: true, accessToken: 'enc-token' } },
      });
      tiktokAdsProvider.disconnect.mockResolvedValue({ status: 'disconnected' });

      const result = await controller.disconnect({
        user: { workspaceId: 'ws-1' },
      } as Parameters<typeof controller.disconnect>[0]);

      expect(result.status).toBe('disconnected');
    });
  });

  describe('getStatus', () => {
    it('should return connected status with advertiser IDs', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: {
          tiktok: {
            connected: true,
            kind: 'advertiser',
            advertiserIds: ['adv-1', 'adv-2'],
            connectedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      });

      const result = await controller.getStatus({
        user: { workspaceId: 'ws-1' },
      } as Parameters<typeof controller.getStatus>[0]);

      expect(result.connected).toBe(true);
      expect(result.advertiserIds).toEqual(['adv-1', 'adv-2']);
    });

    it('should return disconnected when no provider settings exist', async () => {
      (prismaService.workspace.findUnique as jest.Mock).mockResolvedValue({
        providerSettings: {},
      });

      const result = await controller.getStatus({
        user: { workspaceId: 'ws-1' },
      } as Parameters<typeof controller.getStatus>[0]);

      expect(result.connected).toBe(false);
    });
  });
});
