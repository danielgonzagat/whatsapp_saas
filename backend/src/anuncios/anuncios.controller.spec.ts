import { AnunciosController } from './anuncios.controller';

describe('AnunciosController', () => {
  let anunciosService: {
    getPlatformStatuses: jest.Mock;
    getCampaigns: jest.Mock;
    syncCampaigns: jest.Mock;
    syncAccounts: jest.Mock;
  };
  let adsSyncProcessor: {
    getSyncStatus: jest.Mock;
  };
  let controller: AnunciosController;

  beforeEach(() => {
    jest.clearAllMocks();

    anunciosService = {
      getPlatformStatuses: jest.fn(),
      getCampaigns: jest.fn(),
      syncCampaigns: jest.fn(),
      syncAccounts: jest.fn(),
    };

    adsSyncProcessor = {
      getSyncStatus: jest.fn(),
    };

    controller = new AnunciosController(
      anunciosService as never,
      adsSyncProcessor as never,
    );
  });

  describe('GET /anuncios/status', () => {
    it('delegates to service.getPlatformStatuses with workspaceId', async () => {
      const statuses = [
        {
          platform: 'meta',
          connected: true,
          status: 'CONNECTED',
          accountId: 'act-meta-1',
          clientConfigured: true,
        },
      ];
      anunciosService.getPlatformStatuses.mockResolvedValue(statuses);

      const result = await controller.getStatus({ workspaceId: 'ws-1' } as never);

      expect(result).toEqual({ data: statuses });
      expect(anunciosService.getPlatformStatuses).toHaveBeenCalledWith('ws-1');
      expect(anunciosService.getPlatformStatuses).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /anuncios/campaigns', () => {
    it('delegates to service.getCampaigns with workspaceId', async () => {
      const campaigns = [
        {
          id: 'camp-1',
          platform: 'meta',
          accountId: 'act-1',
          campaignId: '12345',
          campaignName: 'Summer Sale',
          status: 'ACTIVE',
          spend: 150,
          revenue: 450,
          roas: 3,
          conversions: 12,
          impressions: 5000,
          clicks: 300,
          ctr: 6,
          cpc: 0.5,
        },
      ];
      anunciosService.getCampaigns.mockResolvedValue(campaigns);

      const result = await controller.getCampaigns({ workspaceId: 'ws-1' } as never);

      expect(result).toEqual({ data: campaigns });
      expect(anunciosService.getCampaigns).toHaveBeenCalledWith('ws-1', undefined);
    });

    it('passes platform filter to service.getCampaigns', async () => {
      anunciosService.getCampaigns.mockResolvedValue([]);

      await controller.getCampaigns({ workspaceId: 'ws-1' } as never, 'google');

      expect(anunciosService.getCampaigns).toHaveBeenCalledWith('ws-1', 'google');
    });
  });

  describe('POST /anuncios/sync', () => {
    it('syncCampaigns delegates to service.syncCampaigns with workspaceId', async () => {
      const campaigns = [
        {
          id: 'camp-synced',
          platform: 'meta',
          accountId: 'act-1',
          campaignId: '67890',
          campaignName: 'Synced Campaign',
          status: 'ACTIVE',
          spend: 200,
          revenue: 600,
          roas: 3,
          conversions: 20,
          impressions: 8000,
          clicks: 400,
          ctr: 5,
          cpc: 0.5,
        },
      ];
      anunciosService.syncCampaigns.mockResolvedValue(campaigns);

      const result = await controller.syncCampaigns({ workspaceId: 'ws-1' } as never);

      expect(result).toEqual({ data: campaigns });
      expect(anunciosService.syncCampaigns).toHaveBeenCalledWith('ws-1');
    });

    it('syncAccounts delegates to service.syncAccounts with workspaceId', async () => {
      const accounts = [
        {
          id: 'acc-1',
          platform: 'meta',
          accountId: 'act-meta-1',
          accountName: 'Meta Account',
          status: 'connected',
          connected: true,
        },
      ];
      anunciosService.syncAccounts.mockResolvedValue(accounts);

      const result = await controller.syncAccounts({ workspaceId: 'ws-1' } as never);

      expect(result).toEqual({ data: accounts });
      expect(anunciosService.syncAccounts).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('error propagation', () => {
    it('propagates errors from service without swallowing', async () => {
      anunciosService.getPlatformStatuses.mockRejectedValue(
        new Error('Provider connection refused'),
      );

      await expect(
        controller.getStatus({ workspaceId: 'ws-1' } as never),
      ).rejects.toThrow('Provider connection refused');
    });

    it('propagates service errors from sync endpoints', async () => {
      anunciosService.syncCampaigns.mockRejectedValue(
        new Error('Sync rate limited'),
      );

      await expect(
        controller.syncCampaigns({ workspaceId: 'ws-1' } as never),
      ).rejects.toThrow('Sync rate limited');
    });
  });

  describe('tenant isolation', () => {
    it('scopes getCampaigns to workspaceId from authenticated request', async () => {
      anunciosService.getCampaigns.mockResolvedValue([]);

      await controller.getCampaigns({ workspaceId: 'ws-tenant-a' } as never);

      expect(anunciosService.getCampaigns).toHaveBeenCalledWith('ws-tenant-a', undefined);
    });

    it('scopes getStatus to a different workspaceId from request', async () => {
      anunciosService.getPlatformStatuses.mockResolvedValue([]);

      await controller.getStatus({ workspaceId: 'ws-tenant-b' } as never);

      expect(anunciosService.getPlatformStatuses).toHaveBeenCalledWith('ws-tenant-b');
    });

    it('falls back to empty string when workspaceId is absent from request', async () => {
      anunciosService.getPlatformStatuses.mockResolvedValue([]);

      await controller.getStatus({} as never);

      expect(anunciosService.getPlatformStatuses).toHaveBeenCalledWith('');
    });
  });
});
