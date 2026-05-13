import { Injectable, Optional  } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
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
  private readonly logger = StructuredLogger.from(WhatsAppChannelTransport.name);

  constructor(@Optional() private readonly whatsappRegistry?: WhatsAppProviderRegistry) {}

  isConfigured(): boolean {
    return !!this.whatsappRegistry;
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    if (!this.whatsappRegistry) {
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
    if (!this.whatsappRegistry) {
      return {
        success: false,
        blocked: true,
        blockedReason: 'WhatsApp nao configurado. Configure WHATSAPP_PROVIDER.',
      };
    }

    try {
      const result = await this.whatsappRegistry.sendMessage(
        workspaceId,
        request.recipientId,
        request.content,
        {
          ...(request.mediaUrl !== undefined ? { mediaUrl: request.mediaUrl } : {}),
          ...(request.mediaType !== undefined ? { mediaType: request.mediaType } : {}),
          ...(request.caption !== undefined ? { caption: request.caption } : {}),
          ...(request.quotedMessageId !== undefined ? { quotedMessageId: request.quotedMessageId } : {}),
        },
      );

      const success = Boolean(result.success);
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
      return { success: true, ...(messageId !== undefined ? { messageId } : {}), blocked: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`WhatsApp send erro workspace=${workspaceId}: ${message}`);
      return { success: false, blocked: false, error: message };
    }
  }
}
