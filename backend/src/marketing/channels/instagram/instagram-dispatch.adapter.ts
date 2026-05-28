/**
 * InstagramDispatchAdapter — implements `ChannelDispatchPort` for the
 * Instagram (Meta) channel. Delegates to the existing
 * `InstagramService.sendMessage(igAccountId, recipientId, text, accessToken)`
 * which posts to the Meta Graph API at `${igAccountId}/messages`.
 *
 * ADR-0012 OmniCore Wave W1 — `marketing/channels/<channel>/` is the
 * canonical home for per-channel dispatch adapters.
 *
 * @cluster Marketing/Channels/Instagram
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
import { InstagramService } from '../../../meta/instagram/instagram.service';

@Injectable()
export class InstagramDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.INSTAGRAM;

  constructor(private readonly instagram: InstagramService) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.INSTAGRAM) {
      return { success: false, error: 'wrong channel kind' };
    }
    try {
      const raw = await this.instagram.sendMessage(
        input.igAccountId,
        input.recipientId,
        input.text,
        input.accessToken,
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
        provider: 'meta-instagram',
        delivery: 'direct',
        ...(messageId ? { messageId, externalId: messageId } : {}),
      };
    } catch (error) {
      return {
        success: false,
        provider: 'meta-instagram',
        error: error instanceof Error ? error.message : 'instagram_send_failed',
      };
    }
  }

  isConfigured(): boolean {
    return Boolean(this.instagram);
  }
}
