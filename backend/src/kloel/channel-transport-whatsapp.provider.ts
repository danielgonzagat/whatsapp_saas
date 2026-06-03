import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { WhatsAppProviderRegistry } from '../marketing/channels/whatsapp/providers/provider-registry';
import { WhatsappMessageDispatcherService } from '../marketing/channels/whatsapp/whatsapp-message-dispatcher.service';
import { isCompliantWhatsappSendEnabled } from '../common/feature-flags/compliant-whatsapp-send.flag';
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

  constructor(
    @Optional() private readonly whatsappRegistry?: WhatsAppProviderRegistry,
    @Optional() private readonly compliantDispatcher?: WhatsappMessageDispatcherService,
  ) {}

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

  /**
   * Map a {@link WhatsappMessageDispatcherService.sendMessage} result onto the
   * transport's {@link ChannelSendResult} contract so the ~16 transport
   * consumers (inbox, webhooks, cart-recovery, agent actions) keep receiving
   * the exact shape they already expect.
   *
   * The dispatcher returns one of:
   *   - `{ error: true, message }`                          → compliance/runtime block
   *   - `{ ok: true, queued: true, delivery: 'queued' }`    → enqueued send
   *   - `{ ok: true, direct: true, delivery, messageId }`   → direct send
   */
  private mapDispatcherResult(
    result: Awaited<ReturnType<WhatsappMessageDispatcherService['sendMessage']>>,
    workspaceId: string,
    recipientId: string,
  ): ChannelSendResult {
    const obj = (result ?? {}) as Record<string, unknown>;
    const ok = obj.ok === true && obj.error !== true;
    if (!ok) {
      const error =
        typeof obj.message === 'string'
          ? obj.message
          : typeof obj.error === 'string'
            ? obj.error
            : 'send_failed';
      this.logger.warn(
        `WhatsApp compliant send falhou workspace=${workspaceId} recipient=${recipientId}: ${error}`,
      );
      // Dispatcher blocks (plan limit / opt-in / runtime) are returned as a
      // soft failure, not a thrown error — same as the legacy direct path.
      return { success: false, blocked: false, error };
    }
    const messageId = typeof obj.messageId === 'string' ? obj.messageId : undefined;
    this.logger.log(
      `WhatsApp compliant send dispatched workspace=${workspaceId} recipient=${recipientId} messageId=${messageId}`,
    );
    return { success: true, ...(messageId !== undefined ? { messageId } : {}), blocked: false };
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    // P0-B compliance flag (KLOEL_COMPLIANT_WHATSAPP_SEND): when ON, route the
    // send through the canonical WhatsappMessageDispatcherService so plan
    // limits, opt-in enforcement, queue routing and billing metering all apply.
    // Flag OFF (default) → byte-identical legacy direct-provider path below.
    if (isCompliantWhatsappSendEnabled() && this.compliantDispatcher) {
      try {
        const result = await this.compliantDispatcher.sendMessage(
          workspaceId,
          request.recipientId,
          request.content,
          {
            ...(request.mediaUrl !== undefined ? { mediaUrl: request.mediaUrl } : {}),
            ...(request.mediaType !== undefined ? { mediaType: request.mediaType } : {}),
            ...(request.caption !== undefined ? { caption: request.caption } : {}),
            ...(request.externalId !== undefined ? { externalId: request.externalId } : {}),
            ...(request.complianceMode !== undefined
              ? { complianceMode: request.complianceMode }
              : {}),
            ...(request.forceDirect !== undefined ? { forceDirect: request.forceDirect } : {}),
            ...(request.quotedMessageId !== undefined
              ? { quotedMessageId: request.quotedMessageId }
              : {}),
          },
        );
        return this.mapDispatcherResult(result, workspaceId, request.recipientId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown_error';
        this.logger.error(`WhatsApp compliant send erro workspace=${workspaceId}: ${message}`);
        return { success: false, blocked: false, error: message };
      }
    }

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
          ...(request.quotedMessageId !== undefined
            ? { quotedMessageId: request.quotedMessageId }
            : {}),
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
