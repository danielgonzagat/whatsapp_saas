import { Injectable, Logger } from '@nestjs/common';
import { forEachSequential } from '../common/async-sequence';
import { getTraceHeaders } from '../common/trace-headers';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';

const NAME_RE = /\{\{name\}\}/g;
const EMAIL_RE = /\{\{email\}\}/g;

/**
 * Email Campaign Service for KLOEL Marketing
 * Uses the same email infrastructure as auth (Resend/SendGrid/SMTP)
 */
@Injectable()
export class EmailCampaignService {
  private readonly logger = new Logger(EmailCampaignService.name);
  private readonly fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';
  private readonly fromName = process.env.EMAIL_FROM_NAME || 'KLOEL';

  constructor() {}

  private getProvider(): 'resend' | 'sendgrid' | 'smtp' | 'log' {
    if (process.env.RESEND_API_KEY) {
      return 'resend';
    }
    if (process.env.SENDGRID_API_KEY) {
      return 'sendgrid';
    }
    if (process.env.SMTP_HOST) {
      return 'smtp';
    }
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
    const { workspaceId: _workspaceId, subject, html, recipients, campaignName } = params;
    const provider = this.getProvider();
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    this.logger.log(
      `Starting email campaign "${campaignName || subject}" to ${recipients.length} recipients via ${provider}`,
    );

    // Rate limit: max 10 emails per second
    await forEachSequential(recipients, async (recipient, index) => {
      try {
        const personalizedHtml = html
          .replace(NAME_RE, recipient.name || 'Cliente')
          .replace(EMAIL_RE, recipient.email);

        const footerHtml = buildUnsubscribeFooterHtml({
          email: recipient.email,
          workspaceId: _workspaceId,
        });
        const htmlWithUnsub = `${personalizedHtml}${footerHtml}`;

        const listUnsubscribe = buildListUnsubscribeHeader({
          email: recipient.email,
          workspaceId: _workspaceId,
        });

        const success = await this.sendEmail(recipient.email, subject, htmlWithUnsub, {
          'List-Unsubscribe': listUnsubscribe,
          'List-Unsubscribe-Post': `List-Unsubscribe=One-Click`,
        });
        if (success) {
          sent++;
        } else {
          failed++;
          errors.push(`Failed to send to ${recipient.email}`);
        }

        // Rate limiting: 100ms delay between sends
        if (index < recipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        failed++;
        errors.push(`${recipient.email}: ${errInstanceofError.message}`);
      }
    });

    this.logger.log(`Campaign complete: ${sent} sent, ${failed} failed`);
    return { sent, failed, errors };
  }

  /** Send single email. */
  async sendSingleEmail(to: string, subject: string, html: string): Promise<boolean> {
    return this.sendEmail(to, subject, html, undefined);
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    headers?: Record<string, string>,
  ): Promise<boolean> {
    const provider = this.getProvider();

    try {
      switch (provider) {
        case 'resend': {
          // Not SSRF: hardcoded Resend API endpoint
          const bodyPayload: Record<string, unknown> = {
            from: `${this.fromName} <${this.fromEmail}>`,
            to,
            subject,
            html,
          };
          if (headers) {
            bodyPayload.headers = headers;
          }
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              ...getTraceHeaders(),
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyPayload),
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) {
            throw new Error(`Resend: ${await res.text()}`);
          }
          return true;
        }
        case 'sendgrid': {
          // Not SSRF: hardcoded SendGrid API endpoint
          const personalization: Record<string, unknown> = { to: [{ email: to }] };
          if (headers) {
            personalization.headers = headers;
          }
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              ...getTraceHeaders(),
              Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [personalization],
              from: { email: this.fromEmail, name: this.fromName },
              subject,
              content: [{ type: 'text/html', value: html }],
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok && res.status !== 202) {
            throw new Error(`SendGrid: ${res.status}`);
          }
          return true;
        }
        case 'smtp':
          this.logger.warn('SMTP campaign sending not yet implemented');
          return false;
        default:
          this.logger.log(`[DEV] Campaign email to ${to}: ${subject}`);
          return true;
      }
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Email send error: ${errInstanceofError.message}`);
      return false;
    }
  }
}
