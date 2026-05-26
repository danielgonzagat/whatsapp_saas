import { BadRequestException } from '@nestjs/common';
import { EmailCampaignService } from '../kloel/email-campaign.service';
import { MarketingController } from './marketing.controller';

type PrismaMock = {
  approvalRequest: {
    create: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('MarketingController direct email send approval gate', () => {
  let controller: MarketingController;
  let prisma: PrismaMock;
  const req = { user: { workspaceId: 'ws-1', email: 'owner@example.com' } };
  const originalResendKey = process.env.RESEND_API_KEY;
  const originalSendgridKey = process.env.SENDGRID_API_KEY;
  const originalSmtpHost = process.env.SMTP_HOST;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.RESEND_API_KEY = '';
    process.env.SENDGRID_API_KEY = '';
    process.env.SMTP_HOST = '';
    process.env.JWT_SECRET = 'test-unsubscribe-secret';
    prisma = {
      approvalRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'ap-direct-1',
          state: 'OPEN',
          title: 'Aprovar envio direto de email: Oferta',
          createdAt: new Date('2026-05-11T22:35:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    controller = new MarketingController(prisma as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.RESEND_API_KEY = originalResendKey;
    process.env.SENDGRID_API_KEY = originalSendgridKey;
    process.env.SMTP_HOST = originalSmtpHost;
    process.env.JWT_SECRET = originalJwtSecret;
  });

  it('creates an approval request instead of sending immediately', async () => {
    const result = await controller.sendEmailCampaign(req, {
      subject: 'Oferta',
      html: '<p>Oi {{name}}</p>',
      recipients: [{ email: 'lead@example.com', name: 'Lead' }],
      campaignName: 'Oferta',
    });

    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          kind: 'marketing_email:direct_send',
          entityType: 'MarketingEmailDirectSend',
          state: 'OPEN',
          payload: expect.objectContaining({
            subject: 'Oferta',
            html: '<p>Oi {{name}}</p>',
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
        approvalRequestId: 'ap-direct-1',
      }),
    );
  });

  it('sends only from an approved request payload and then completes the approval', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-direct-1',
      payload: {
        subject: 'Oferta aprovada',
        html: '<p>Oi {{name}}</p>',
        recipients: [{ email: 'lead@example.com', name: 'Lead' }],
        campaignName: 'Oferta',
      },
    });

    const result = await controller.sendEmailCampaign(req, {
      approvalRequestId: 'ap-direct-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        sent: 1,
        failed: 0,
        total: 1,
        provider: 'log',
        approvalExecuted: true,
      }),
    );
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ap-direct-1', workspaceId: 'ws-1', state: 'APPROVED' },
        data: expect.objectContaining({ state: 'COMPLETED' }),
      }),
    );
  });

  it('routes approved direct sends through SMTP when SMTP is the configured provider', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-direct-1',
      payload: {
        subject: 'Oferta SMTP',
        html: '<p>Oi {{name}}</p>',
        recipients: [{ email: 'lead@example.com', name: 'Lead' }],
        campaignName: 'Oferta SMTP',
      },
    });
    jest.spyOn(EmailCampaignService.prototype, 'resolveDelivery').mockReturnValue({
      provider: 'smtp',
      fromEmail: 'noreply@kloel.com',
      fromName: 'KLOEL',
      smtp: { host: 'smtp.example.com', port: 587, secure: false },
    });
    const sendCampaign = jest
      .spyOn(EmailCampaignService.prototype, 'sendCampaign')
      .mockResolvedValue({ sent: 1, failed: 0, errors: [] });

    const result = await controller.sendEmailCampaign(req, {
      approvalRequestId: 'ap-direct-1',
    });

    expect(sendCampaign).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      subject: 'Oferta SMTP',
      html: '<p>Oi {{name}}</p>',
      recipients: [{ email: 'lead@example.com', name: 'Lead' }],
      campaignName: 'Oferta SMTP',
    });
    expect(result).toEqual(
      expect.objectContaining({
        sent: 1,
        failed: 0,
        total: 1,
        provider: 'smtp',
        approvalExecuted: true,
      }),
    );
  });

  it('rejects execution when the approval is not approved', async () => {
    await expect(
      controller.sendEmailCampaign(req, { approvalRequestId: 'ap-direct-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
