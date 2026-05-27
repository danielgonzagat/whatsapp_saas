/**
 * FacebookDispatchAdapter — implements `ChannelDispatchPort` for the
 * Facebook page channel. Delegates to `FacebookMessengerService.sendMessage`
 * which posts via Graph API and persists the outbound message.
 *
 * ADR-0012 OmniCore Wave W1.
 *
 * @cluster Marketing/Channels/Facebook
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
import { FacebookMessengerService } from '../../facebook-messenger.service';

@Injectable()
export class FacebookDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.FACEBOOK;

  constructor(private readonly facebook: FacebookMessengerService) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.FACEBOOK) {
      return { success: false, error: 'wrong channel kind' };
    }
    const result = await this.facebook.sendMessage(
      input.workspaceId,
      input.pageId,
      input.recipientPsid,
      input.text,
      input.pageAccessToken,
    );
    if (result.error) {
      return {
        success: false,
        provider: 'meta-facebook',
        error: result.error,
      };
    }
    return {
      success: true,
      provider: 'meta-facebook',
      delivery: 'direct',
      ...(result.mid ? { messageId: result.mid, externalId: result.mid } : {}),
    };
  }

  isConfigured(): boolean {
    return Boolean(this.facebook);
  }
}
