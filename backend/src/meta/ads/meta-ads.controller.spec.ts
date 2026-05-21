import { BadRequestException } from '@nestjs/common';
import { MetaAdsController } from './meta-ads.controller';

describe('MetaAdsController approval gates', () => {
  const req = { user: { workspaceId: 'ws-1' }, workspaceId: 'ws-1' };
  let metaAdsService: { updateCampaignStatus: jest.Mock; getCampaigns: jest.Mock };
  let metaWhatsApp: { resolveConnection: jest.Mock };
  let prisma: {
    approvalRequest: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let controller: MetaAdsController;

  beforeEach(() => {
    metaAdsService = {
      updateCampaignStatus: jest.fn().mockResolvedValue({ success: true }),
      getCampaigns: jest.fn(),
    };
    metaWhatsApp = {
      resolveConnection: jest.fn().mockResolvedValue({ accessToken: 'token-redacted' }),
    };
    prisma = {
      approvalRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'ap-meta-1',
          state: 'OPEN',
          title: 'Aprovar alteracao de status Meta Ads para PAUSED',
          createdAt: new Date('2026-05-11T22:40:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    controller = new MetaAdsController(
      metaAdsService as never,
      metaWhatsApp as never,
      prisma as never,
    );
  });

  it('creates an approval request instead of mutating Meta Ads status immediately', async () => {
    const result = await controller.updateCampaignStatus(req as never, 'cmp_123', {
      status: 'PAUSED',
    });

    expect(metaAdsService.updateCampaignStatus).not.toHaveBeenCalled();
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          kind: 'meta_ads:campaign_status',
          entityType: 'MetaAdsCampaign',
          entityId: 'cmp_123',
          state: 'OPEN',
          payload: expect.objectContaining({
            campaignId: 'cmp_123',
            status: 'PAUSED',
            risk: 'high',
            requiresApproval: true,
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        approvalRequired: true,
        approvalRequestId: 'ap-meta-1',
      }),
    );
  });

  it('executes the Meta Ads status mutation only from an approved request', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-meta-1',
      payload: { campaignId: 'cmp_123', status: 'ACTIVE' },
    });

    const result = await controller.updateCampaignStatus(req as never, 'cmp_123', {
      approvalRequestId: 'ap-meta-1',
    });

    expect(metaAdsService.updateCampaignStatus).toHaveBeenCalledWith(
      'cmp_123',
      'ACTIVE',
      'token-redacted',
    );
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ap-meta-1', workspaceId: 'ws-1', state: 'APPROVED' },
        data: expect.objectContaining({ state: 'COMPLETED' }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ approvalExecuted: true }));
  });

  it('rejects execution when the approval is not approved', async () => {
    await expect(
      controller.updateCampaignStatus(req as never, 'cmp_123', {
        approvalRequestId: 'ap-meta-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(metaAdsService.updateCampaignStatus).not.toHaveBeenCalled();
  });
});
