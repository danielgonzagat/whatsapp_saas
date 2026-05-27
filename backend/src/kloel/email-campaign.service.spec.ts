import { Logger } from '@nestjs/common';
import { EmailService } from '../auth/email.service';
import { EmailCampaignService } from './email-campaign.service';

describe('EmailCampaignService', () => {
  const originalResend = process.env.RESEND_API_KEY;
  const originalSendgrid = process.env.SENDGRID_API_KEY;
  const originalSmtp = process.env.SMTP_HOST;
  const originalUnsubscribeSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;

  afterEach(() => {
    if (originalResend === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResend;
    }
    if (originalSendgrid === undefined) {
      delete process.env.SENDGRID_API_KEY;
    } else {
      process.env.SENDGRID_API_KEY = originalSendgrid;
    }
    if (originalSmtp === undefined) {
      delete process.env.SMTP_HOST;
    } else {
      process.env.SMTP_HOST = originalSmtp;
    }
    if (originalUnsubscribeSecret === undefined) {
      delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    } else {
      process.env.EMAIL_UNSUBSCRIBE_SECRET = originalUnsubscribeSecret;
    }
    jest.restoreAllMocks();
  });

  it('uses the shared EmailService SMTP transport for campaigns', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-unsubscribe-secret';
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const sendEmail = jest.spyOn(EmailService.prototype, 'sendEmail').mockResolvedValue(true);

    const service = new EmailCampaignService();
    const result = await service.sendCampaign({
      workspaceId: 'ws-1',
      subject: 'Oferta',
      html: '<p>Ola {{name}} {{email}}</p>',
      recipients: [{ email: 'lead@example.com', name: 'Lead' }],
    });

    expect(result).toEqual({ sent: 1, failed: 0, errors: [] });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'lead@example.com',
        subject: 'Oferta',
        html: expect.stringContaining('Lead lead@example.com'),
        headers: expect.objectContaining({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }),
      }),
    );
  });
});
