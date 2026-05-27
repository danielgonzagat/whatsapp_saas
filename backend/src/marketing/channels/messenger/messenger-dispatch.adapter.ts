/**
 * MessengerDispatchAdapter — implements `ChannelDispatchPort` for the
 * Messenger (Meta) channel. Delegates to the existing `MessengerService`.
 * Routes to `sendTextMessage` for text-only payloads and `sendMediaMessage`
 * when `mediaUrl` + `mediaType` are present.
 *
 * ADR-0012 OmniCore Wave W1.
 *
 * @cluster Marketing/Channels/Messenger
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable } from '@nestjs/common';
import {
  ChannelDispatchPort,
  ChannelKind,
  ChannelSendInput,
  ChannelSendResult,
} from '../../../common/channel-dispatch/channel-dispatch.port';
import { MessengerService } from '../../../meta/messenger/messenger.service';

@Injectable()
export class MessengerDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.MESSENGER;

  constructor(private readonly messenger: MessengerService) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.MESSENGER) {
      return { success: false, error: 'wrong channel kind' };
    }
    try {
      const raw =
        input.mediaUrl && input.mediaType
          ? await this.messenger.sendMediaMessage(
              input.pageId,
              input.recipientId,
              input.mediaType,
              input.mediaUrl,
              input.pageAccessToken,
            )
          : await this.messenger.sendTextMessage(
              input.pageId,
              input.recipientId,
              input.text,
              input.pageAccessToken,
            );
      const obj = (raw ?? {}) as Record<string, unknown>;
      const messageId =
        typeof obj.message_id === 'string'
          ? obj.message_id
          : typeof obj.id === 'string'
            ? obj.id
            : undefined;
      return {
        success: true,
        provider: 'meta-messenger',
        delivery: 'direct',
        ...(messageId ? { messageId, externalId: messageId } : {}),
      };
    } catch (error) {
      return {
        success: false,
        provider: 'meta-messenger',
        error: error instanceof Error ? error.message : 'messenger_send_failed',
      };
    }
  }

  isConfigured(): boolean {
    return Boolean(this.messenger);
  }
}
