import { Injectable, Logger, Optional } from '@nestjs/common';
import { InstagramService } from '../meta/instagram/instagram.service';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { MessengerService } from '../meta/messenger/messenger.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailCampaignService } from './email-campaign.service';
import type { EmailDeliveryOverride } from './email-smtp-delivery';
import { isWorkspaceDeliveryReady, readWorkspaceEmailDelivery } from './email-workspace-delivery';
import { renderEmailLine } from './email-html';
import type {
  ChannelCapability,
  ChannelName,
  ChannelSendRequest,
  ChannelSendResult,
  ChannelTransportProvider,
} from './channel-transport.types';
export { WhatsAppChannelTransport } from './channel-transport-whatsapp.provider';
function blockedCapability(
  channel: ChannelName,
  reason: string,
  setup: string[] = [],
): ChannelCapability {
  return {
    channel,
    sendAvailable: false,
    sendBlockedReason: reason,
    requiredSetup: setup,
  };
}
function availableCapability(channel: ChannelName): ChannelCapability {
  return {
    channel,
    sendAvailable: true,
    sendBlockedReason: null,
    requiredSetup: [],
  };
}
function blockedResult(reason: string): ChannelSendResult {
  return { success: false, blocked: true, blockedReason: reason };
}
@Injectable()
export class InstagramChannelTransport implements ChannelTransportProvider {
  readonly channel: ChannelName = 'instagram';
  private readonly logger = new Logger(InstagramChannelTransport.name);

  constructor(
    @Optional() private readonly instagram?: InstagramService,
    @Optional() private readonly metaConnection?: MetaWhatsAppService,
  ) {}

  isConfigured(): boolean {
    return !!this.instagram;
  }

  async capability(workspaceId: string): Promise<ChannelCapability> {
    if (!this.instagram) {
      return blockedCapability(
        'instagram',
        'InstagramService nao disponivel — verifique se META_APP_SECRET e META_APP_ID estao configurados',
        ['META_APP_SECRET', 'META_APP_ID'],
      );
    }
    const connection = await this.metaConnection?.resolveConnection(workspaceId);
    if (!connection?.instagramAccountId || !connection.accessToken || connection.tokenExpired) {
      return blockedCapability(
        'instagram',
        'Instagram outbound bloqueado ate existir uma conta profissional conectada com token valido.',
        ['META_APP_ID', 'META_APP_SECRET', 'Instagram Professional Account'],
      );
    }
    return availableCapability('instagram');
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.instagram) {
      return blockedResult('Instagram nao configurado. Configure META_APP_SECRET e META_APP_ID.');
    }

    try {
      const connection = await this.metaConnection?.resolveConnection(workspaceId);
      if (!connection?.instagramAccountId || !connection.accessToken || connection.tokenExpired) {
        return blockedResult(
          'Instagram outbound bloqueado ate existir uma conta profissional conectada com token valido.',
        );
      }

      const response = await this.instagram.sendMessage(
        connection.instagramAccountId,
        request.recipientId,
        request.content,
        connection.accessToken,
      );

      this.logger.log(
        `Instagram send dispatched workspace=${workspaceId} recipient=${request.recipientId}`,
      );

      const rawResponse = response as Record<string, unknown> | undefined;
      const messageId =
        typeof rawResponse?.message_id === 'string' ? rawResponse.message_id : undefined;

      return {
        success: true,
        messageId,
        blocked: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`Instagram send failed workspace=${workspaceId}: ${message}`);
      return { success: false, blocked: false, error: message };
    }
  }
}

@Injectable()
export class MessengerChannelTransport implements ChannelTransportProvider {
  readonly channel: ChannelName = 'messenger';
  private readonly logger = new Logger(MessengerChannelTransport.name);

  constructor(
    @Optional() private readonly messenger?: MessengerService,
    @Optional() private readonly metaConnection?: MetaWhatsAppService,
  ) {}

  isConfigured(): boolean {
    return !!this.messenger;
  }

  async capability(workspaceId: string): Promise<ChannelCapability> {
    if (!this.messenger) {
      return blockedCapability(
        'messenger',
        'MessengerService nao disponivel — verifique se META_APP_SECRET e META_APP_ID estao configurados',
        ['META_APP_SECRET', 'META_APP_ID'],
      );
    }
    const connection = await this.metaConnection?.resolveConnection(workspaceId);
    if (!connection?.pageId || !connection.pageAccessToken || connection.tokenExpired) {
      return blockedCapability(
        'messenger',
        'Messenger outbound bloqueado ate existir pagina conectada com page token valido.',
        ['META_APP_ID', 'META_APP_SECRET', 'Facebook Page'],
      );
    }
    return availableCapability('messenger');
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.messenger) {
      return blockedResult('Messenger nao configurado. Configure META_APP_SECRET e META_APP_ID.');
    }

    try {
      const connection = await this.metaConnection?.resolveConnection(workspaceId);
      if (!connection?.pageId || !connection.pageAccessToken || connection.tokenExpired) {
        return blockedResult(
          'Messenger outbound bloqueado ate existir pagina conectada com page token valido.',
        );
      }

      const response = await this.messenger.sendTextMessage(
        connection.pageId,
        request.recipientId,
        request.content,
        connection.pageAccessToken,
      );

      this.logger.log(
        `Messenger send dispatched workspace=${workspaceId} recipient=${request.recipientId}`,
      );

      const rawResponse = response as Record<string, unknown> | undefined;
      const messageId =
        typeof rawResponse?.message_id === 'string' ? rawResponse.message_id : undefined;

      return {
        success: true,
        messageId,
        blocked: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`Messenger send failed workspace=${workspaceId}: ${message}`);
      return { success: false, blocked: false, error: message };
    }
  }
}

@Injectable()
export class TikTokChannelTransport implements ChannelTransportProvider {
  readonly channel: ChannelName = 'tiktok';
  private readonly logger = new Logger(TikTokChannelTransport.name);

  isConfigured(): boolean {
    return false;
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    return Promise.resolve(
      blockedCapability(
        'tiktok',
        'TikTok Business Messaging API nao suporta envio outbound programatico no momento. O canal esta disponivel apenas para recebimento de mensagens via webhook.',
        [],
      ),
    );
  }

  send(_workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    this.logger.warn(
      `TikTok send bloqueado — API outbound nao suportada. ` +
        `Requisição ignorada para recipient=${request.recipientId}`,
    );
    return Promise.resolve(
      blockedResult(
        'TikTok nao suporta envio outbound programatico. Apenas recebimento de mensagens via webhook esta disponivel.',
      ),
    );
  }
}

function hasEmailProvider(): 'resend' | 'sendgrid' | 'smtp' | null {
  if (process.env.RESEND_API_KEY?.trim()) return 'resend';
  if (process.env.SENDGRID_API_KEY?.trim()) return 'sendgrid';
  if (
    (process.env.EMAIL_OUTBOUND_SMTP_HOST?.trim() || process.env.SMTP_HOST?.trim()) &&
    (process.env.EMAIL_OUTBOUND_SMTP_USER?.trim() || process.env.SMTP_USER?.trim())
  )
    return 'smtp';
  return null;
}

@Injectable()
export class EmailChannelTransport implements ChannelTransportProvider {
  readonly channel: ChannelName = 'email';
  private readonly logger = new Logger(EmailChannelTransport.name);

  constructor(
    @Optional() private readonly emailCampaign?: EmailCampaignService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.emailCampaign);
  }

  async capability(workspaceId: string): Promise<ChannelCapability> {
    const workspaceDelivery = await this.resolveWorkspaceDelivery(workspaceId);
    if (isWorkspaceDeliveryReady(workspaceDelivery)) {
      return availableCapability('email');
    }

    const provider = hasEmailProvider();
    if (provider === 'resend' || provider === 'sendgrid' || provider === 'smtp') {
      return Promise.resolve(availableCapability('email'));
    }
    return Promise.resolve(
      blockedCapability(
        'email',
        'Email outbound nao configurado. Configure RESEND_API_KEY, SENDGRID_API_KEY ou credenciais SMTP.',
        [
          'RESEND_API_KEY',
          'SENDGRID_API_KEY',
          'EMAIL_OUTBOUND_SMTP_HOST',
          'EMAIL_OUTBOUND_SMTP_USER',
        ],
      ),
    );
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.emailCampaign) {
      return blockedResult(
        'EmailCampaignService nao disponivel no modulo — verifique o registro de providers em kloel.module.ts.',
      );
    }

    const provider = hasEmailProvider();
    const workspaceDelivery = await this.resolveWorkspaceDelivery(workspaceId);
    if (!provider && !isWorkspaceDeliveryReady(workspaceDelivery)) {
      return blockedResult(
        'Email outbound nao configurado. Configure RESEND_API_KEY, SENDGRID_API_KEY ou credenciais SMTP.',
      );
    }

    try {
      const { subject, html } = this.adaptContent(request.content);

      const success = await this.emailCampaign.sendSingleEmail(
        request.recipientId,
        subject,
        html,
        workspaceDelivery ?? undefined,
      );

      if (!success) {
        this.logger.warn(
          `Email send falhou workspace=${workspaceId} recipient=${request.recipientId}`,
        );
        return { success: false, blocked: false, error: 'email_send_failed' };
      }

      this.logger.log(
        `Email send dispatched workspace=${workspaceId} recipient=${request.recipientId} via ${provider}`,
      );

      return { success: true, blocked: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`Email send erro workspace=${workspaceId}: ${message}`);
      return { success: false, blocked: false, error: message };
    }
  }

  private async resolveWorkspaceDelivery(
    workspaceId: string,
  ): Promise<EmailDeliveryOverride | null> {
    if (!this.prisma) {
      return null;
    }
    const config = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: 'email' } },
      select: { transferCriteria: true },
    });
    return readWorkspaceEmailDelivery(config?.transferCriteria);
  }

  private adaptContent(content: string): { subject: string; html: string } {
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim() ?? '';
    const subject = firstLine.length > 0 && firstLine.length <= 120 ? firstLine : 'Mensagem Kloel';
    const bodyLines = firstLine.length > 0 && firstLine.length <= 120 ? lines.slice(1) : lines;

    if (/<[a-z][\s\S]*>/i.test(content)) {
      return { subject, html: content };
    }

    const htmlParagraphs = bodyLines.map((line) => renderEmailLine(line)).join('\n');

    return { subject, html: htmlParagraphs || renderEmailLine(content) };
  }
}
