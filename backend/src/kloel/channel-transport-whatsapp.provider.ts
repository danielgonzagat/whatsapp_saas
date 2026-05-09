import { Injectable, Logger, Optional } from '@nestjs/common';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import type {
  ChannelCapability,
  ChannelName,
  ChannelSendRequest,
  ChannelSendResult,
  ChannelTransportProvider,
} from './channel-transport.types';

@Injectable()
export class WhatsAppChannelTransport implements ChannelTransportProvider {
  readonly channel: ChannelName = 'whatsapp';
  private readonly logger = new Logger(WhatsAppChannelTransport.name);

  constructor(
    @Optional() private readonly whatsapp?: WhatsappService,
    @Optional() private readonly whatsappRegistry?: WhatsAppProviderRegistry,
  ) {}

  isConfigured(): boolean {
    return !!this.whatsapp || !!this.whatsappRegistry;
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    if (!this.whatsapp && !this.whatsappRegistry) {
      return Promise.resolve({
        channel: 'whatsapp',
        sendAvailable: false,
        sendBlockedReason:
          'WhatsApp Provider Registry nao disponivel — verifique se WHATSAPP_PROVIDER esta configurado.',
        requiredSetup: ['WHATSAPP_PROVIDER'],
      });
    }
    return Promise.resolve({
      channel: 'whatsapp',
      sendAvailable: true,
      sendBlockedReason: null,
      requiredSetup: [],
    });
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!this.whatsapp && !this.whatsappRegistry) {
      return {
        success: false,
        blocked: true,
        blockedReason: 'WhatsApp nao configurado. Configure WHATSAPP_PROVIDER.',
      };
    }

    try {
      const result = this.whatsapp
        ? await this.whatsapp.sendMessage(workspaceId, request.recipientId, request.content, {
            mediaUrl: request.mediaUrl,
            mediaType: request.mediaType,
            caption: request.caption,
            externalId: request.externalId,
            complianceMode: request.complianceMode,
            forceDirect: request.forceDirect,
            quotedMessageId: request.quotedMessageId,
          })
        : await this.whatsappRegistry!.sendMessage(
            workspaceId,
            request.recipientId,
            request.content,
            {
              mediaUrl: request.mediaUrl,
              mediaType: request.mediaType,
              caption: request.caption,
              quotedMessageId: request.quotedMessageId,
            },
          );

      const success = 'success' in result ? Boolean(result.success) : Boolean(result.ok);
      const error =
        'error' in result && typeof result.error === 'string'
          ? result.error
          : 'message' in result && typeof result.message === 'string'
            ? result.message
            : undefined;
      const messageId = 'messageId' in result ? result.messageId : undefined;

      if (!success) {
        this.logger.warn(
          `WhatsApp send falhou workspace=${workspaceId} recipient=${request.recipientId}: ${error ?? 'unknown'}`,
        );
        return { success: false, blocked: false, error: error ?? 'send_failed' };
      }

      this.logger.log(
        `WhatsApp send dispatched workspace=${workspaceId} recipient=${request.recipientId} messageId=${messageId}`,
      );
      return { success: true, messageId, blocked: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`WhatsApp send erro workspace=${workspaceId}: ${message}`);
      return { success: false, blocked: false, error: message };
    }
  }
}
