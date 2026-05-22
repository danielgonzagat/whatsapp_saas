import { BadRequestException } from '@nestjs/common';
import { EmailMarketingController } from './email-marketing.controller';

type EmailMarketingServiceMock = {
  createCampaign: jest.Mock;
  listCampaigns: jest.Mock;
  getCampaignWithDeliveries: jest.Mock;
  enqueueSend: jest.Mock;
};

type PrismaMock = {
  approvalRequest: {
    create: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('EmailMarketingController', () => {
  let controller: EmailMarketingController;
  let emailMarketingService: EmailMarketingServiceMock;
  let prisma: PrismaMock;

  const req = { user: { workspaceId: 'ws-1', email: 'owner@example.com' } };

  beforeEach(() => {
    emailMarketingService = {
      createCampaign: jest.fn(),
      listCampaigns: jest.fn(),
      getCampaignWithDeliveries: jest.fn().mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Oferta Maio',
        status: 'DRAFT',
        recipients: [{ id: 'r-1' }, { id: 'r-2' }],
      }),
      enqueueSend: jest.fn().mockResolvedValue({ id: 'camp-1', status: 'SCHEDULED' }),
    };
    prisma = {
      approvalRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'ap-email-1',
          state: 'OPEN',
          title: 'Aprovar envio da campanha Oferta Maio',
          createdAt: new Date('2026-05-11T22:30:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    controller = new EmailMarketingController(emailMarketingService as never, prisma as never);
  });

  it('creates an approval request instead of sending an email campaign immediately', async () => {
    const result = await controller.sendCampaign(req, 'camp-1');

    expect(emailMarketingService.enqueueSend).not.toHaveBeenCalled();
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          kind: 'email_campaign:send',
          entityType: 'EmailCampaign',
          entityId: 'camp-1',
          state: 'OPEN',
          payload: expect.objectContaining({
            campaignId: 'camp-1',
            recipientCount: 2,
            requestedByEmail: 'owner@example.com',
            risk: 'high',
            requiresApproval: true,
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        approvalRequired: true,
        approvalRequestId: 'ap-email-1',
        approvalState: 'OPEN',
      }),
    );
  });

  it('enqueues the campaign only when an approved request is supplied', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({ id: 'ap-email-1' });

    const result = await controller.sendCampaign(req, 'camp-1', {
      approvalRequestId: 'ap-email-1',
    });

    expect(emailMarketingService.enqueueSend).toHaveBeenCalledWith('camp-1', 'ws-1');
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ap-email-1', workspaceId: 'ws-1', state: 'APPROVED' },
        data: expect.objectContaining({ state: 'COMPLETED' }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        campaign: { id: 'camp-1', status: 'SCHEDULED' },
        approvalExecuted: true,
      }),
    );
  });

  it('rejects approval execution when the approval is not approved for that campaign', async () => {
    await expect(
      controller.sendCampaign(req, 'camp-1', { approvalRequestId: 'ap-email-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(emailMarketingService.enqueueSend).not.toHaveBeenCalled();
  });
});
