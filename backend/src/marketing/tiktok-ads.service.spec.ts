import { TikTokAdsService } from './tiktok-ads.service';

jest.mock('../meta/meta-token-crypto', () => ({
  decryptMetaToken: jest.fn(),
}));

jest.mock('../whatsapp/provider-settings.types', () => ({
  asProviderSettings: jest.fn(),
}));

describe('TikTokAdsService', () => {
  const workspaceFindUnique = jest.fn();

  let service: TikTokAdsService;
  let fetchSpy: jest.SpyInstance;
  let decryptMetaToken: jest.Mock;
  let asProviderSettings: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    const cryptoMock = jest.requireMock('../meta/meta-token-crypto');
    decryptMetaToken = cryptoMock.decryptMetaToken;
    decryptMetaToken.mockImplementation((token: unknown) => token);

    const settingsMock = jest.requireMock('../whatsapp/provider-settings.types');
    asProviderSettings = settingsMock.asProviderSettings;
    asProviderSettings.mockImplementation((val: unknown) => val ?? {});

    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no fetch mock configured'));

    service = new TikTokAdsService({
      workspace: { findUnique: workspaceFindUnique },
    } as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('resolveAccessToken (via getAccessTokenAndAdvertiserIds)', () => {
    it('returns accessToken and advertiserIds for a valid workspace', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          tiktok: {
            accessToken: 'encrypted-token',
            advertiserIds: ['adv-1', 'adv-2'],
          },
        },
      });
      decryptMetaToken.mockReturnValue('plain-token');

      const result = await service.getAccessTokenAndAdvertiserIds('ws-1');

      expect(decryptMetaToken).toHaveBeenCalledWith('encrypted-token');
      expect(result).toEqual({
        accessToken: 'plain-token',
        advertiserIds: ['adv-1', 'adv-2'],
      });
    });

    it('throws error when accessToken is missing', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          tiktok: { advertiserIds: ['adv-1'] },
        },
      });
      decryptMetaToken.mockReturnValue('');

      await expect(service.getAccessTokenAndAdvertiserIds('ws-1')).rejects.toThrow(
        'tiktok_ads_not_configured: no access token found',
      );
    });

    it('throws error when advertiserIds is empty', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          tiktok: { accessToken: 'encrypted-token', advertiserIds: [] },
        },
      });
      decryptMetaToken.mockReturnValue('plain-token');

      await expect(service.getAccessTokenAndAdvertiserIds('ws-1')).rejects.toThrow(
        'tiktok_ads_not_configured: no advertiser IDs found',
      );
    });
  });

  describe('getCampaignsForAdvertiser', () => {
    it('fetches a single page of campaigns', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          data: {
            list: [
              {
                campaign_id: 'c-1',
                campaign_name: 'Brand Awareness',
                advertiser_id: 'adv-1',
                primary_status: 'STATUS_ENABLE',
                operation_status: 'ENABLE',
                objective_type: 'REACH',
                budget: 10000,
                budget_mode: 'DAILY',
              },
              {
                campaign_id: 'c-2',
                campaign_name: 'Leads Gen',
                advertiser_id: 'adv-1',
                primary_status: 'STATUS_DISABLE',
              },
            ],
            page_info: { page: 1, page_size: 100, total_number: 2, total_page: 1 },
          },
        }),
      });

      const result = await service.getCampaignsForAdvertiser('token-abc', 'adv-1');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        campaignId: 'c-1',
        campaignName: 'Brand Awareness',
        advertiserId: 'adv-1',
        status: 'STATUS_ENABLE',
      });
      expect(result[1]).toEqual({
        campaignId: 'c-2',
        campaignName: 'Leads Gen',
        advertiserId: 'adv-1',
        status: 'STATUS_DISABLE',
      });
    });

    it('handles paginated campaign responses', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          json: async () => ({
            code: 0,
            data: {
              list: [{ campaign_id: 'c-1', campaign_name: 'Campaign 1', primary_status: 'ENABLE' }],
              page_info: { page: 1, page_size: 100, total_number: 3, total_page: 3 },
            },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            code: 0,
            data: {
              list: [{ campaign_id: 'c-2', campaign_name: 'Campaign 2', primary_status: 'ENABLE' }],
              page_info: { page: 2, page_size: 100, total_number: 3, total_page: 3 },
            },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            code: 0,
            data: {
              list: [
                { campaign_id: 'c-3', campaign_name: 'Campaign 3', primary_status: 'DISABLE' },
              ],
              page_info: { page: 3, page_size: 100, total_number: 3, total_page: 3 },
            },
          }),
        });

      const result = await service.getCampaignsForAdvertiser('token-abc', 'adv-1', 1, 100);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
    });

    it('propagates API errors', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: async () => ({
          code: 40100,
          message: 'Access token expired',
        }),
      });

      await expect(service.getCampaignsForAdvertiser('bad-token', 'adv-1')).rejects.toThrow(
        'TikTok Ads API error [40100]: Access token expired',
      );
    });
  });

  describe('getReport', () => {
    it('fetches a single page of report data', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          data: {
            list: [
              {
                dimensions: {
                  advertiser_id: 'adv-1',
                  campaign_id: 'c-1',
                  stat_time_day: '2026-05-01',
                },
                metrics: {
                  spend: 150.5,
                  impressions: 5000,
                  clicks: 120,
                  conversion: 5,
                  ctr: 2.4,
                  cpc: 1.25,
                  cpm: 30.1,
                  cost_per_conversion: 30.1,
                  video_play_actions: 3000,
                },
              },
            ],
            page_info: { page: 1, page_size: 200, total_number: 1, total_page: 1 },
          },
        }),
      });

      const result = await service.getReport('token-abc', 'adv-1', '2026-05-01', '2026-05-01');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        advertiserId: 'adv-1',
        campaignId: 'c-1',
        date: '2026-05-01',
        spend: 150.5,
        impressions: 5000,
        clicks: 120,
        conversions: 5,
        ctr: 2.4,
        cpc: 1.25,
        cpa: 30.1,
        videoPlayActions: 3000,
      });
    });

    it('handles paginated report responses', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          json: async () => ({
            code: 0,
            data: {
              list: [
                {
                  dimensions: { campaign_id: 'c-1', stat_time_day: '2026-05-01' },
                  metrics: { spend: 100, impressions: 1000 },
                },
              ],
              page_info: { page: 1, page_size: 200, total_number: 2, total_page: 2 },
            },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            code: 0,
            data: {
              list: [
                {
                  dimensions: { campaign_id: 'c-1', stat_time_day: '2026-05-02' },
                  metrics: { spend: 50, impressions: 500 },
                },
              ],
              page_info: { page: 2, page_size: 200, total_number: 2, total_page: 2 },
            },
          }),
        });

      const result = await service.getReport('token-abc', 'adv-1', '2026-05-01', '2026-05-02');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('propagates API errors from report endpoint', async () => {
      fetchSpy.mockResolvedValueOnce({
        json: async () => ({
          code: 40002,
          message: 'Invalid date range',
        }),
      });

      await expect(service.getReport('token-abc', 'adv-1', 'invalid', 'invalid')).rejects.toThrow(
        'TikTok Ads API error [40002]: Invalid date range',
      );
    });
  });

  describe('getAccessTokenAndAdvertiserIds', () => {
    it('delegates to resolveAccessToken correctly', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          tiktok: {
            accessToken: 'enc-token',
            advertiserIds: ['adv-1'],
          },
        },
      });
      decryptMetaToken.mockReturnValue('plain-token');

      const result = await service.getAccessTokenAndAdvertiserIds('ws-1');

      expect(result.accessToken).toBe('plain-token');
      expect(result.advertiserIds).toEqual(['adv-1']);
    });
  });
});
