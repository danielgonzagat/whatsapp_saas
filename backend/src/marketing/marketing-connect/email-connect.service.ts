import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailCampaignService } from '../../kloel/email-campaign.service';
import {
  isWorkspaceDeliveryReady,
  readWorkspaceEmailDelivery,
} from '../../kloel/email-workspace-delivery';
import { buildUnsubscribeFooterHtml } from '../../common/utils/unsubscribe-footer.util';
import { asProviderSettings } from '../../whatsapp/provider-settings.types';
import { EMAIL_VALIDATION_HTML_BODY } from '../marketing-connect.helpers';
import { MailboxGmailOAuthService } from '../mailbox-gmail-oauth.service';
import { MailboxMicrosoftOAuthService } from '../mailbox-microsoft-oauth.service';
import { MailboxImapSmtpService } from '../mailbox-imap-smtp.service';
import {
  type EmailSubSettings,
  type EmailProviderSnapshot,
} from './shared/channel-helpers';

@Injectable()
export class EmailConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailCampaign: EmailCampaignService,
    private readonly gmailMailbox: MailboxGmailOAuthService,
    private readonly microsoftMailbox: MailboxMicrosoftOAuthService,
    private readonly imapSmtpMailbox: MailboxImapSmtpService,
  ) {}

  private getGlobalEmailProviderSnapshot(): EmailProviderSnapshot {
    const provider = process.env.RESEND_API_KEY
      ? 'resend'
      : process.env.SENDGRID_API_KEY
        ? 'sendgrid'
        : process.env.EMAIL_OUTBOUND_SMTP_HOST || process.env.SMTP_HOST
          ? 'smtp'
          : 'log';

    return {
      provider,
      available: provider !== 'log',
      fromEmail: process.env.EMAIL_FROM || 'noreply@kloel.com',
      fromName: process.env.EMAIL_FROM_NAME || 'KLOEL',
      workspaceConfigured: false,
    };
  }

  async getProviderSnapshot(workspaceId: string): Promise<EmailProviderSnapshot> {
    const config = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: 'email' } },
      select: { transferCriteria: true },
    });
    const delivery = readWorkspaceEmailDelivery(config?.transferCriteria);
    if (isWorkspaceDeliveryReady(delivery)) {
      return {
        provider: delivery?.provider ?? 'email',
        available: true,
        fromEmail: delivery?.fromEmail || process.env.EMAIL_FROM || 'noreply@kloel.com',
        fromName: delivery?.fromName || process.env.EMAIL_FROM_NAME || 'KLOEL',
        workspaceConfigured: true,
      };
    }
    return this.getGlobalEmailProviderSnapshot();
  }

  async sendSingleEmail(
    workspaceId: string,
    recipientEmail: string,
    subject: string,
    html: string,
  ) {
    const providerConfig = await this.getProviderSnapshot(workspaceId);
    if (!providerConfig.available) {
      throw new BadRequestException('email_provider_not_configured');
    }

    const safeHtml = html + buildUnsubscribeFooterHtml({ email: recipientEmail });
    const config = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: 'email' } },
      select: { transferCriteria: true },
    });
    const delivery = readWorkspaceEmailDelivery(config?.transferCriteria);
    const success = await this.emailCampaign.sendSingleEmail(
      recipientEmail,
      subject,
      safeHtml,
      isWorkspaceDeliveryReady(delivery) ? (delivery ?? undefined) : undefined,
    );
    if (!success) {
      throw new BadRequestException('email_provider_rejected_request');
    }

    return { provider: providerConfig.provider };
  }

  async getStatus(workspaceId: string) {
    const [workspace, gmailMailbox, microsoftMailbox, imapSmtpMailbox] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true, name: true },
      }),
      this.gmailMailbox.getPrimaryGmailStatus(workspaceId).catch(() => null),
      this.microsoftMailbox.getPrimaryMicrosoftStatus(workspaceId).catch(() => null),
      this.imapSmtpMailbox.getPrimaryImapSmtpStatus(workspaceId).catch(() => null),
    ]);
    const connectedMailbox = gmailMailbox || microsoftMailbox || imapSmtpMailbox;

    const providerSettings = asProviderSettings(workspace?.providerSettings);
    const emailSettings = (providerSettings.email ?? { enabled: false }) as EmailSubSettings;
    const emailProvider = await this.getProviderSnapshot(workspaceId);

    return {
      connected: Boolean(
        connectedMailbox || (emailProvider.available && emailSettings.enabled),
      ),
      status: connectedMailbox
        ? 'connected'
        : emailProvider.available
          ? emailSettings.enabled
            ? 'connected'
            : 'disconnected'
          : 'unavailable',
      enabled: Boolean(emailSettings.enabled),
      provider: gmailMailbox
        ? 'gmail'
        : microsoftMailbox
          ? 'microsoft'
          : imapSmtpMailbox
            ? 'imap_smtp'
            : emailProvider.provider,
      providerAvailable: emailProvider.available,
      fromEmail:
        gmailMailbox?.email ||
        microsoftMailbox?.email ||
        imapSmtpMailbox?.email ||
        emailProvider.fromEmail,
      fromName: emailProvider.fromName,
      mailboxConnectionId: connectedMailbox?.id || null,
      mailboxProvider: connectedMailbox?.provider || null,
      mailboxStatus: connectedMailbox?.status || null,
      lastSyncAt: connectedMailbox?.lastSyncAt || null,
      lastErrorAt: connectedMailbox?.lastErrorAt || null,
      lastError: connectedMailbox?.lastError || null,
      workspaceName: workspace?.name || null,
    };
  }

  async connect(workspaceId: string, enabled: boolean) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = asProviderSettings(workspace?.providerSettings);

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          email: {
            ...(typeof currentSettings.email === 'object' && currentSettings.email !== null
              ? currentSettings.email
              : {}),
            enabled,
          },
        } as unknown as Prisma.InputJsonObject,
      },
    });
  }

  async disconnect(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = asProviderSettings(workspace?.providerSettings);

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          email: { enabled: false },
        } as unknown as Prisma.InputJsonObject,
      },
    });
  }

  async sendTest(workspaceId: string, userEmail: string, bodyToEmail?: string) {
    const toEmail = String(bodyToEmail || userEmail || '').trim();
    if (!toEmail) {
      throw new BadRequestException('email_test_recipient_required');
    }

    const result = await this.sendSingleEmail(
      workspaceId,
      toEmail,
      'KLOEL - conexao de email validada',
      EMAIL_VALIDATION_HTML_BODY,
    );

    return { success: true, workspaceId, toEmail, provider: result.provider };
  }
}
