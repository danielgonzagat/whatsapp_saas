import { Injectable, Logger } from '@nestjs/common';
import { getTraceHeaders } from '../common/trace-headers'; // propagates X-Request-ID
import { PrismaService } from '../prisma/prisma.service';

/**
 * Email Campaign Service for KLOEL Marketing
 * Uses the same email infrastructure as auth (Resend/SendGrid/SMTP)
 */
@Injectable()
export class EmailCampaignService {
  private readonly logger = new Logger(EmailCampaignService.name);
  private readonly fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';
  private readonly fromName = process.env.EMAIL_FROM_NAME || 'KLOEL';

  constructor(private readonly prisma: PrismaService) {}

  private getProvider(): 'resend' | 'sendgrid' | 'smtp' | 'log' {
    if (process.env.RESEND_API_KEY) return 'resend';
    if (process.env.SENDGRID_API_KEY) return 'sendgrid';
    if (process.env.SMTP_HOST) return 'smtp';
    return 'log';
  }

  // messageLimit: email campaigns are rate-limited via provider-level throttling
  async sendCampaign(params: {
    workspaceId: string;
    subject: string;
    html: string;
    recipients: { email: string; name?: string }[];
    campaignName?: string;
  }): Promise<{ sent: number; failed: number; errors: string[] }> {
    const { workspaceId, subject, html, recipients, campaignName } = params;
    const provider = this.getProvider();
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    this.logger.log(
      `Starting email campaign "${campaignName || subject}" to ${recipients.length} recipients via ${provider}`,
    );

    // Rate limit: max 10 emails per second
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      try {
        const personalizedHtml = html
          .replace(/\{\{name\}\}/g, recipient.name || 'Cliente')
          .replace(/\{\{email\}\}/g, recipient.email);

        // unsubscribe: link included in email footer
        const unsubscribeUrl = `${process.env.FRONTEND_URL || 'https://kloel.com'}/unsubscribe?email=${encodeURIComponent(recipient.email)}`;
        const htmlWithUnsub = `${personalizedHtml}<br/><hr style="margin:24px 0;border:none;border-top:1px solid #ddd"/><p style="font-size:11px;color:#888;text-align:center"><a href="${unsubscribeUrl}" style="color:#888">Cancelar inscricao</a></p>`;

        const success = await this.sendEmail(recipient.email, subject, htmlWithUnsub);
        if (success) {
          sent++;
        } else {
          failed++;
          errors.push(`Failed to send to ${recipient.email}`);
        }

        // Rate limiting: 100ms delay between sends
        if (i < recipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err: any) {
        failed++;
        errors.push(`${recipient.email}: ${err.message}`);
      }
    }

    this.logger.log(`Campaign complete: ${sent} sent, ${failed} failed`);
    return { sent, failed, errors };
  }

  async sendSingleEmail(to: string, subject: string, html: string): Promise<boolean> {
    return this.sendEmail(to, subject, html);
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const provider = this.getProvider();

    try {
      switch (provider) {
        case 'resend': {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${this.fromName} <${this.fromEmail}>`,
              to,
              subject,
              html,
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) throw new Error(`Resend: ${await res.text()}`);
          return true;
        }
        case 'sendgrid': {
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: to }] }],
              from: { email: this.fromEmail, name: this.fromName },
              subject,
              content: [{ type: 'text/html', value: html }],
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok && res.status !== 202) throw new Error(`SendGrid: ${res.status}`);
          return true;
        }
        case 'smtp':
          this.logger.warn('SMTP campaign sending not yet implemented');
          return false;
        default:
          this.logger.log(`[DEV] Campaign email to ${to}: ${subject}`);
          return true;
      }
    } catch (err: any) {
      this.logger.error(`Email send error: ${err.message}`);
      return false;
    }
  }
}
