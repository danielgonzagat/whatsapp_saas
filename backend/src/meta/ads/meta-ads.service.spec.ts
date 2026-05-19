import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { MetaAdsService } from './meta-ads.service';
import { MetaSdkService } from '../meta-sdk.service';

function createMockMetaSdk() {
  return {
    graphApiGet: jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
    graphApiPost: jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
  };
}

describe('MetaAdsService', () => {
  let service: MetaAdsService;
  let metaSdk: ReturnType<typeof createMockMetaSdk>;

  beforeEach(async () => {
    metaSdk = createMockMetaSdk();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MetaAdsService, { provide: MetaSdkService, useValue: metaSdk }],
    }).compile();

    service = module.get<MetaAdsService>(MetaAdsService);
  });

  describe('getCampaigns', () => {
    it('delegates to metaSdk.graphApiGet with act_ prefix', async () => {
      const mockResponse = { data: [{ id: '1', name: 'Campaign A' }] };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getCampaigns('12345', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'act_12345/campaigns',
        expect.objectContaining({
          fields: expect.stringContaining('id,name,status'),
        }),
        'token',
      );
    });

    it('merges extra params into the request', async () => {
      metaSdk.graphApiGet.mockResolvedValue({ data: [] });

      await service.getCampaigns('12345', 'token', {
        filtering: JSON.stringify([{ field: 'status', operator: 'EQUAL', value: 'ACTIVE' }]),
      });

      const [, params] = metaSdk.graphApiGet.mock.calls[0] as [string, Record<string, unknown>];
      expect(params.filtering).toBeDefined();
      expect(params.fields).toBeDefined();
    });

    it('passes the token as third argument to metaSdk', async () => {
      metaSdk.graphApiGet.mockResolvedValue({ data: [] });

      const shortToken = 'abcdXXXX';
      await service.getCampaigns('12345', shortToken);

      const [, , accessToken] = metaSdk.graphApiGet.mock.calls[0] as [
        string,
        Record<string, unknown>,
        string,
      ];
      expect(accessToken).toBe(shortToken);
    });
  });

  describe('getAccountInsights', () => {
    it('delegates to metaSdk with time_range JSON and level', async () => {
      const mockResponse = {
        data: [{ spend: '100', impressions: '5000' }],
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getAccountInsights('12345', 'token', {
        since: '2024-01-01',
        until: '2024-01-31',
        level: 'campaign',
      });

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'act_12345/insights',
        expect.objectContaining({
          time_range: JSON.stringify({
            since: '2024-01-01',
            until: '2024-01-31',
          }),
          level: 'campaign',
        }),
        'token',
      );
    });

    it('defaults level to account when not provided', async () => {
      metaSdk.graphApiGet.mockResolvedValue({ data: [] });

      await service.getAccountInsights('12345', 'token', {
        since: '2024-01-01',
        until: '2024-01-31',
      });

      const [, params] = metaSdk.graphApiGet.mock.calls[0] as [string, Record<string, unknown>];
      expect(params.level).toBe('account');
    });
  });

  describe('getCampaignInsights', () => {
    it('delegates to metaSdk with campaign ID and time range', async () => {
      const mockResponse = {
        data: [{ spend: '50', impressions: '2000' }],
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getCampaignInsights(
        'camp_99',
        'token',
        '2024-01-01',
        '2024-01-31',
      );

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'camp_99/insights',
        expect.objectContaining({
          fields: expect.stringContaining('spend,impressions'),
          time_range: JSON.stringify({
            since: '2024-01-01',
            until: '2024-01-31',
          }),
        }),
        'token',
      );
    });
  });

  describe('updateCampaignStatus', () => {
    it('sets status to ACTIVE via graphApiPost', async () => {
      const mockResponse = { success: true };
      metaSdk.graphApiPost.mockResolvedValue(mockResponse);

      const result = await service.updateCampaignStatus('camp_1', 'ACTIVE', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiPost).toHaveBeenCalledWith('camp_1', { status: 'ACTIVE' }, 'token');
    });

    it('sets status to PAUSED via graphApiPost', async () => {
      const mockResponse = { success: true };
      metaSdk.graphApiPost.mockResolvedValue(mockResponse);

      const result = await service.updateCampaignStatus('camp_2', 'PAUSED', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiPost).toHaveBeenCalledWith('camp_2', { status: 'PAUSED' }, 'token');
    });
  });

  describe('getLeadForms', () => {
    it('delegates to metaSdk.graphApiGet with leadgen_forms endpoint', async () => {
      const mockResponse = {
        data: [{ id: 'form_1', name: 'Form A', status: 'ACTIVE', leads_count: 42 }],
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getLeadForms('page_1', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'page_1/leadgen_forms',
        { fields: 'id,name,status,leads_count' },
        'token',
      );
    });
  });

  describe('getLeads', () => {
    it('delegates to metaSdk.graphApiGet with leads endpoint', async () => {
      const mockResponse = {
        data: [{ id: 'lead_1', created_time: '2024-01-01', field_data: [] }],
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getLeads('form_1', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'form_1/leads',
        { fields: 'id,created_time,field_data' },
        'token',
      );
    });
  });
});
