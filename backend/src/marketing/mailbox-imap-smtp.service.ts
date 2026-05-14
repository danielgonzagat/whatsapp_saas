import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MailboxProvider, MailboxStatus, Prisma } from '@prisma/client';
import { createTransport } from 'nodemailer';
import { Metrics } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildUnsubscribeFooterHtml,
  buildUnsubscribeFooterText,
  buildListUnsubscribeHeader,
} from '../common/utils/unsubscribe-footer.util';
import {
  MailboxSocketConfig,
  validateImapSocket,
  validateSmtpSocket,
} from './mailbox-imap-smtp-socket.helpers';
import { decryptMailboxToken, encryptMailboxToken } from './mailbox-token-crypto';
interface ImapSmtpConnectInput {
  email?: unknown;
  imapHost?: unknown;
  imapPort?: unknown;
  imapSecure?: unknown;
  imapUsername?: unknown;
  imapPassword?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpSecure?: unknown;
  smtpUsername?: unknown;
  smtpPassword?: unknown;
}
const MAX_HOST_LENGTH = 255;
const MAX_USERNAME_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1000;
function cleanText(value: unknown, maxLength: number): string {
  return String(typeof value === 'string' || typeof value === 'number' ? value : '')
    .trim()
    .slice(0, maxLength);
}
function cleanEmail(value: unknown): string {
  const email = cleanText(value, MAX_USERNAME_LENGTH).toLowerCase();
  if (!email || !email.includes('@')) {
    throw new BadRequestException('mailbox_email_required');
  }
  return email;
}
function cleanHost(value: unknown, field: string): string {
  const host = cleanText(value, MAX_HOST_LENGTH);
  if (!host || host.includes('/') || host.includes('\\')) {
    throw new BadRequestException(`${field}_required`);
  }
  return host;
}
function cleanPort(value: unknown, fallback: number, field: string): number {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException(`${field}_invalid`);
  }
  return port;
}
function cleanCredential(value: unknown, field: string): string {
  const credential = cleanText(
    value,
    field.includes('Password') ? MAX_PASSWORD_LENGTH : MAX_USERNAME_LENGTH,
  );
  if (!credential) {
    throw new BadRequestException(`${field}_required`);
  }
  return credential;
}
@Injectable()
export class MailboxImapSmtpService {
  private readonly logger = new Logger(MailboxImapSmtpService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MailboxImapSmtpService initialized`);
  }
  async connectMailbox(workspaceId: string, input: ImapSmtpConnectInput) {
    const email = cleanEmail(input.email);
    const imap = this.readImapConfig(input);
    const smtp = this.readSmtpConfig(input);
    await Promise.all([this.validateImapConnection(imap), this.validateSmtpConnection(smtp)]);
    const connection = await this.prisma.mailboxConnection.upsert({
      where: {
        workspaceId_provider_email: {
          workspaceId,
          provider: MailboxProvider.IMAP_SMTP,
          email,
        },
      },
      create: {
        workspaceId,
        provider: MailboxProvider.IMAP_SMTP,
        email,
        status: MailboxStatus.ACTIVE,
        imapHost: imap.host,
        imapPort: imap.port,
        imapSecure: imap.secure,
        imapUsername: imap.username,
        imapPassword: encryptMailboxToken(imap.password) ?? null,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecure: smtp.secure,
        smtpUsername: smtp.username,
        smtpPassword: encryptMailboxToken(smtp.password) ?? null,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorAt: null,
        lastError: null,
        metadata: this.buildMetadata(),
      },
      update: {
        status: MailboxStatus.ACTIVE,
        imapHost: imap.host,
        imapPort: imap.port,
        imapSecure: imap.secure,
        imapUsername: imap.username,
        imapPassword: encryptMailboxToken(imap.password) ?? null,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecure: smtp.secure,
        smtpUsername: smtp.username,
        smtpPassword: encryptMailboxToken(smtp.password) ?? null,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorAt: null,
        lastError: null,
        metadata: this.buildMetadata(),
      },
      select: {
        id: true,
        provider: true,
        email: true,
        status: true,
        connectedAt: true,
      },
    });
    Metrics.mailbox.connected('imap_smtp', { workspace_id: workspaceId });
    return {
      connected: true,
      provider: 'imap_smtp',
      status: 'connected',
      email: connection.email,
      connectionId: connection.id,
    };
  }
  async getPrimaryImapSmtpStatus(workspaceId: string) {
    return this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.IMAP_SMTP,
        status: MailboxStatus.ACTIVE,
      },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        email: true,
        provider: true,
        status: true,
        connectedAt: true,
        lastSyncAt: true,
        lastErrorAt: true,
        lastError: true,
      },
    });
  }
  private readImapConfig(input: ImapSmtpConnectInput): MailboxSocketConfig {
    const secure = input.imapSecure !== false;
    return {
      host: cleanHost(input.imapHost, 'imap_host'),
      port: cleanPort(input.imapPort, secure ? 993 : 143, 'imap_port'),
      secure,
      username: cleanCredential(input.imapUsername || input.email, 'imapUsername'),
      password: cleanCredential(input.imapPassword, 'imapPassword'),
    };
  }
  private readSmtpConfig(input: ImapSmtpConnectInput): MailboxSocketConfig {
    const secure = input.smtpSecure !== false;
    return {
      host: cleanHost(input.smtpHost, 'smtp_host'),
      port: cleanPort(input.smtpPort, secure ? 465 : 587, 'smtp_port'),
      secure,
      username: cleanCredential(input.smtpUsername || input.email, 'smtpUsername'),
      password: cleanCredential(input.smtpPassword, 'smtpPassword'),
    };
  }
  private buildMetadata() {
    return {
      provider: 'imap_smtp',
      validatedAt: new Date().toISOString(),
      validation: {
        imap: 'login_list_logout',
        smtp: 'ehlo_auth_quit',
      },
    } satisfies Prisma.InputJsonObject;
  }
  private async validateImapConnection(config: MailboxSocketConfig): Promise<void> {
    await validateImapSocket(config);
  }
  private async validateSmtpConnection(config: MailboxSocketConfig): Promise<void> {
    await validateSmtpSocket(config);
  }
  async sendMessageFromMailbox(
    workspaceId: string,
    input: {
      toEmail: string;
      subject?: string;
      html?: string;
      proactive?: boolean;
    },
  ) {
    const toEmail = String(input.toEmail || '')
      .trim()
      .toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      throw new BadRequestException('imap_smtp_recipient_required');
    }
    if (input.proactive !== false && (await this.isSuppressedRecipient(workspaceId, toEmail))) {
      Metrics.mailbox.sendSuppressed('imap_smtp', { workspace_id: workspaceId });
      return {
        provider: 'imap_smtp',
        status: 'suppressed',
        sent: false,
        toEmail,
        reason: 'recipient_unsubscribed',
      };
    }
    const connection = await this.getActiveImapSmtpConnection(workspaceId);
    if (!connection) {
      Metrics.mailbox.sendFailed('imap_smtp', 'not_connected', {
        workspace_id: workspaceId,
      });
      return { provider: 'imap_smtp', status: 'not_connected', sent: false };
    }
    const smtpPassword = decryptMailboxToken(connection.smtpPassword);
    if (!smtpPassword || !connection.smtpHost) {
      throw new BadRequestException('imap_smtp_credentials_missing');
    }
    const subject = String(input.subject || 'Kloel CIA - mensagem de teste')
      .trim()
      .slice(0, 160);
    const baseHtml =
      input.html ||
      '<p>Esta mensagem foi enviada pela CIA usando a caixa IMAP/SMTP conectada ao workspace.</p>';
    const html =
      input.proactive === false
        ? baseHtml
        : `${baseHtml}${buildUnsubscribeFooterHtml({ email: toEmail })}`;
    const textHtml =
      input.proactive === false
        ? baseHtml.replace(/<[^>]*>/g, '')
        : `${baseHtml.replace(/<[^>]*>/g, '')}${buildUnsubscribeFooterText({ email: toEmail })}`;
    const proactive = input.proactive !== false;
    const transport = createTransport({
      host: connection.smtpHost,
      port: connection.smtpPort ?? (connection.smtpSecure ? 465 : 587),
      secure: connection.smtpSecure,
      auth: {
        user: decryptMailboxToken(connection.smtpUsername) || connection.email,
        pass: smtpPassword,
      },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    try {
      const headers: Record<string, string> = {};
      if (proactive) {
        headers['List-Unsubscribe'] = buildListUnsubscribeHeader({
          email: toEmail,
        });
      }
      const info = await transport.sendMail({
        from: connection.email,
        to: toEmail,
        subject,
        html,
        text: textHtml,
        headers,
      });
      Metrics.mailbox.sendCompleted('imap_smtp', { workspace_id: workspaceId });
      return {
        provider: 'imap_smtp',
        status: 'sent',
        sent: true,
        email: connection.email,
        toEmail,
        messageId: info.messageId || `smtp:${Date.now()}`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 100) : 'smtp_send_failed';
      await this.prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          lastErrorAt: new Date(),
          lastError: reason,
        },
      });
      Metrics.mailbox.sendFailed('imap_smtp', reason, {
        workspace_id: workspaceId,
      });
      throw new BadRequestException('imap_smtp_send_failed');
    } finally {
      transport.close();
    }
  }
  private async getActiveImapSmtpConnection(workspaceId: string) {
    return this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.IMAP_SMTP,
        status: MailboxStatus.ACTIVE,
      },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUsername: true,
        smtpPassword: true,
      },
    });
  }
  private async isSuppressedRecipient(workspaceId: string, email: string): Promise<boolean> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        workspaceId,
        email: { equals: email, mode: 'insensitive' },
        optIn: false,
      },
      select: { id: true, optedOutAt: true },
    });
    return Boolean(contact);
  }
}
