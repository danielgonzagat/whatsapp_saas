import { Injectable, Logger, Optional } from '@nestjs/common';
import { InstagramService } from '../meta/instagram/instagram.service';
import { MessengerService } from '../meta/messenger/messenger.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import type {
  ChannelCapability,
  ChannelName,
  ChannelSendRequest,
  ChannelSendResult,
  ChannelTransportProvider,
} from './channel-transport.types';

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

  constructor(@Optional() private readonly instagram?: InstagramService) {}

  isConfigured(): boolean {
    return !!this.instagram;
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    if (!this.instagram) {
      return Promise.resolve(
        blockedCapability(
          'instagram',
          'InstagramService nao disponivel — verifique se META_APP_SECRET e META_APP_ID estao configurados',
          ['META_APP_SECRET', 'META_APP_ID'],
        ),
      );
    }
    return Promise.resolve(availableCapability('instagram'));
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.instagram) {
      return blockedResult('Instagram nao configurado. Configure META_APP_SECRET e META_APP_ID.');
    }

    try {
      const response = await this.instagram.sendMessage(
        request.recipientId,
        request.recipientId,
        request.content,
        'access_token_placeholder',
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

  constructor(@Optional() private readonly messenger?: MessengerService) {}

  isConfigured(): boolean {
    return !!this.messenger;
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    if (!this.messenger) {
      return Promise.resolve(
        blockedCapability(
          'messenger',
          'MessengerService nao disponivel — verifique se META_APP_SECRET e META_APP_ID estao configurados',
          ['META_APP_SECRET', 'META_APP_ID'],
        ),
      );
    }
    return Promise.resolve(availableCapability('messenger'));
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.messenger) {
      return blockedResult('Messenger nao configurado. Configure META_APP_SECRET e META_APP_ID.');
    }

    try {
      const response = await this.messenger.sendTextMessage(
        request.recipientId,
        request.recipientId,
        request.content,
        'page_access_token_placeholder',
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

@Injectable()
export class EmailChannelTransport implements ChannelTransportProvider {
  readonly channel: ChannelName = 'email';
  private readonly logger = new Logger(EmailChannelTransport.name);

  isConfigured(): boolean {
    return Boolean(
      process.env.EMAIL_OUTBOUND_SMTP_HOST?.trim() && process.env.EMAIL_OUTBOUND_SMTP_USER?.trim(),
    );
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    const configured = this.isConfigured();
    if (!configured) {
      return Promise.resolve(
        blockedCapability(
          'email',
          'SMTP outbound nao configurado. Configure EMAIL_OUTBOUND_SMTP_HOST e EMAIL_OUTBOUND_SMTP_USER.',
          ['EMAIL_OUTBOUND_SMTP_HOST', 'EMAIL_OUTBOUND_SMTP_USER'],
        ),
      );
    }
    return Promise.resolve(availableCapability('email'));
  }

  send(_workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.isConfigured()) {
      return Promise.resolve(
        blockedResult(
          'Email outbound nao configurado. Configure EMAIL_OUTBOUND_SMTP_HOST e EMAIL_OUTBOUND_SMTP_USER.',
        ),
      );
    }

    this.logger.warn(
      `Email send bloqueado — SMTP transport nao implementado. ` +
        `Requisição para recipient=${request.recipientId}`,
    );
    return Promise.resolve(
      blockedResult(
        'Email outbound SMTP transport ainda nao implementado. O canal esta disponivel apenas para recebimento de emails.',
      ),
    );
  }
}

@Injectable()
export class WhatsAppChannelTransport implements ChannelTransportProvider {
  readonly channel: ChannelName = 'whatsapp';
  private readonly logger = new Logger(WhatsAppChannelTransport.name);

  constructor(@Optional() private readonly whatsappRegistry?: WhatsAppProviderRegistry) {}

  isConfigured(): boolean {
    return !!this.whatsappRegistry;
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    if (!this.whatsappRegistry) {
      return Promise.resolve(
        blockedCapability(
          'whatsapp',
          'WhatsApp Provider Registry nao disponivel — verifique se WHATSAPP_PROVIDER esta configurado.',
          ['WHATSAPP_PROVIDER'],
        ),
      );
    }
    return Promise.resolve(availableCapability('whatsapp'));
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.whatsappRegistry) {
      return blockedResult('WhatsApp nao configurado. Configure WHATSAPP_PROVIDER.');
    }

    try {
      const result = await this.whatsappRegistry.sendMessage(
        workspaceId,
        request.recipientId,
        request.content,
        request.mediaUrl ? { mediaUrl: request.mediaUrl, mediaType: request.mediaType } : undefined,
      );

      if (!result.success) {
        this.logger.warn(
          `WhatsApp send falhou workspace=${workspaceId} recipient=${request.recipientId}: ${result.error ?? 'unknown'}`,
        );
        return {
          success: false,
          blocked: false,
          error: result.error ?? 'send_failed',
        };
      }

      this.logger.log(
        `WhatsApp send dispatched workspace=${workspaceId} recipient=${request.recipientId} messageId=${result.messageId}`,
      );

      return {
        success: true,
        messageId: result.messageId,
        blocked: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`WhatsApp send erro workspace=${workspaceId}: ${message}`);
      return { success: false, blocked: false, error: message };
    }
  }
}
