import { BadRequestException } from '@nestjs/common';
import { MetaAdsController } from './meta-ads.controller';

describe('MetaAdsController', () => {
  const metaAdsService = {
    getCampaigns: jest.fn(),
    updateCampaignStatus: jest.fn(),
    getAccountInsights: jest.fn(),
    getCampaignInsights: jest.fn(),
    getLeadForms: jest.fn(),
    getLeads: jest.fn(),
  } as any;

  const metaWhatsApp = {
    resolveConnection: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the persisted workspace ad token for campaign reads', async () => {
    metaWhatsApp.resolveConnection.mockResolvedValue({
      accessToken: 'workspace-token',
      adAccountId: '123456',
      pageId: 'page-1',
    });
    metaAdsService.getCampaigns.mockResolvedValue({ data: [] });

    const controller = new MetaAdsController(metaAdsService, metaWhatsApp);

    await expect(
      controller.getCampaigns({ user: { workspaceId: 'ws-1' } } as any, ''),
    ).resolves.toEqual({ data: [] });

    expect(metaAdsService.getCampaigns).toHaveBeenCalledWith('123456', 'workspace-token');
  });

  it('rejects ads operations when the workspace has no persisted token', async () => {
    metaWhatsApp.resolveConnection.mockResolvedValue({
      accessToken: '',
      adAccountId: '123456',
      pageId: 'page-1',
    });

    const controller = new MetaAdsController(metaAdsService, metaWhatsApp);

    await expect(
      controller.getLeadForms({ user: { workspaceId: 'ws-1' } } as any, 'page-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
