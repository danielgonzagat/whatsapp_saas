import type { PrismaService } from '../prisma/prisma.service';
import { MetaMarketingProvider } from './meta-marketing.provider';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('MetaMarketingProvider', () => {
  let provider: MetaMarketingProvider;
  let mockPrisma: ReturnType<typeof createPartialPrismaMock>;
  let mockMetaSdk: {
    graphApiGet: jest.Mock;
    graphApiDelete: jest.Mock;
  };
  let mockMetaAds: {
    getCampaigns: jest.Mock;
    getCampaignInsights: jest.Mock;
    getAccountInsights: jest.Mock;
    updateCampaignStatus: jest.Mock;
  };

  beforeEach(() => {
    mockPrisma = createPartialPrismaMock({
      metaConnection: ['upsert', 'findFirst', 'delete', 'update'],
    });
    mockPrisma.metaConnection.upsert.mockResolvedValue({});
    mockPrisma.metaConnection.delete.mockResolvedValue({});
    mockPrisma.metaConnection.update.mockResolvedValue({});

    mockMetaSdk = {
      graphApiGet: jest.fn().mockResolvedValue({ data: [] }),
      graphApiDelete: jest.fn().mockResolvedValue({ success: true }),
    };

    mockMetaAds = {
      getCampaigns: jest.fn().mockResolvedValue({ data: [] }),
      getCampaignInsights: jest.fn().mockResolvedValue({ data: [] }),
      getAccountInsights: jest.fn().mockResolvedValue({ data: [] }),
      updateCampaignStatus: jest.fn().mockResolvedValue({ success: true }),
    };

    provider = new MetaMarketingProvider(
      mockPrisma as never as PrismaService,
      mockMetaSdk as never,
      mockMetaAds as never,
    );
  });

  describe('platform', () => {
    it('returns meta', () => {
      expect(provider.platform).toBe('meta');
    });
  });

  describe('connect', () => {
    it('returns pending_oauth with authUrl when app ID configured', async () => {
      process.env.META_APP_ID = 'test-app-id';

      const result = await provider.connect('ws-1', 'https://app.kloel.com/anuncios/callback/meta');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('pending_oauth');
      expect(result.authUrl).toBeDefined();
      expect(result.authUrl).toContain('facebook.com');
      expect(result.authUrl).toContain('test-app-id');

      delete process.env.META_APP_ID;
    });

    it('returns meta_app_id_not_configured when app ID missing', async () => {
      delete process.env.META_APP_ID;

      const result = await provider.connect('ws-1', 'https://app.kloel.com/callback');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('meta_app_id_not_configured');
    });
  });

  describe('completeOAuth', () => {
    it('returns token_exchange_failed when no access token in response', async () => {
      process.env.META_APP_ID = 'test-app-id';
      process.env.META_APP_SECRET = 'test-app-secret';

      mockMetaSdk.graphApiGet.mockResolvedValue({ access_token: undefined });

      const result = await provider.completeOAuth('ws-1', 'auth-code', 'https://redirect');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('token_exchange_failed');

      delete process.env.META_APP_ID;
      delete process.env.META_APP_SECRET;
    });

    it('returns meta_credentials_not_configured when app ID/secret missing', async () => {
      delete process.env.META_APP_ID;

      const result = await provider.completeOAuth('ws-1', 'code', 'https://redirect');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('meta_credentials_not_configured');
    });

    it('encrypts token and persists MetaConnection on success', async () => {
      process.env.META_APP_ID = 'test-app-id';
      process.env.META_APP_SECRET = 'test-app-secret';
      process.env.META_TOKEN_ENCRYPTION_KEY = 'c29tZS1iYXNlNjQtZW5jb2RlZC0zMmJ5dGVzLWtleQ==';

      mockMetaSdk.graphApiGet.mockResolvedValueOnce({
        access_token: 'short-lived-token',
      });

      mockMetaSdk.graphApiGet.mockResolvedValueOnce({
        data: [{ id: 'act_123', name: 'Test Ad Account' }],
      });

      const result = await provider.completeOAuth('ws-1', 'auth-code', 'https://redirect');

      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(mockPrisma.metaConnection.upsert).toHaveBeenCalled();

      const upsertCall = mockPrisma.metaConnection.upsert.mock.calls[0] as [
        Record<string, unknown>,
      ];
      const createData = upsertCall[0].create as Record<string, unknown>;
      expect(String(createData.accessToken)).toMatch(/^v1\./);

      delete process.env.META_APP_ID;
      delete process.env.META_APP_SECRET;
      delete process.env.META_TOKEN_ENCRYPTION_KEY;
    });
  });

  describe('getStatus', () => {
    it('returns connected when MetaConnection status is connected', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        status: 'connected',
        adAccountId: 'act_123',
      });

      const result = await provider.getStatus('ws-1');

      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(result.accountId).toBe('act_123');
    });

    it('returns disconnected when no MetaConnection', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue(null);

      const result = await provider.getStatus('ws-none');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('disconnected');
    });
  });

  describe('syncAccounts', () => {
    it('returns empty accounts when no connection', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue(null);

      const result = await provider.syncAccounts('ws-none');

      expect(result.accounts).toEqual([]);
    });

    it('returns accounts from Meta API', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        accessToken: 'token-123',
        adAccountId: 'act_456',
      });

      mockMetaSdk.graphApiGet.mockResolvedValue({
        id: 'act_456',
        name: 'My Ad Account',
        account_status: 'ACTIVE',
      });

      const result = await provider.syncAccounts('ws-1');

      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0].platform).toBe('meta');
      expect(result.accounts[0].accountName).toBe('My Ad Account');
    });
  });

  describe('syncCampaigns', () => {
    it('returns empty campaigns when no connection', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue(null);

      const result = await provider.syncCampaigns('ws-none');

      expect(result.campaigns).toEqual([]);
    });

    it('returns campaigns with insights from Meta API', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        accessToken: 'token-123',
        adAccountId: 'act_456',
      });

      mockMetaAds.getCampaigns.mockResolvedValue({
        data: [{ id: '23849012345', name: 'Summer Sale', status: 'ACTIVE' }],
      });

      mockMetaAds.getCampaignInsights.mockResolvedValue({
        data: [
          {
            impressions: '5000',
            clicks: '120',
            spend: '50.00',
            ctr: '2.40',
            cpc: '0.42',
          },
        ],
      });

      const result = await provider.syncCampaigns('ws-1');

      expect(result.campaigns.length).toBe(1);
      expect(result.campaigns[0].campaignId).toBe('23849012345');
      expect(result.campaigns[0].spend).toBe(50);
      expect(result.campaigns[0].impressions).toBe(5000);
    });
  });

  describe('syncInsights', () => {
    it('returns empty insights when no connection', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue(null);

      const result = await provider.syncInsights('ws-none', new Date(), new Date());

      expect(result.insights).toEqual([]);
    });
  });

  describe('disconnect', () => {
    it('removes MetaConnection and attempts Meta-side revocation', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        workspaceId: 'ws-1',
        accessToken: 'v1.encrypted-token',
      });

      const result = await provider.disconnect('ws-1');

      expect(result.status).toBe('disconnected');
      expect(mockPrisma.metaConnection.delete).toHaveBeenCalled();
    });

    it('returns already_disconnected when no MetaConnection', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue(null);

      const result = await provider.disconnect('ws-none');

      expect(result.status).toBe('already_disconnected');
    });
  });
});
