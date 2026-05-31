/**
 * TikTokDispatchAdapter — implements `ChannelDispatchPort` for the TikTok
 * channel.
 *
 * TikTok Business Messaging has NO programmatic outbound-send API today: the
 * platform only supports RECEIVING messages via webhook. So this adapter is
 * intentionally an HONEST blocked surface — it never fakes a send. When (if)
 * TikTok ships an outbound DM/Ads API, this is the single drop-in place to
 * wire the real client; the canonical `ChannelDispatchRegistry` already routes
 * `ChannelKind.TIKTOK` here.
 *
 * Mirrors the long-standing honest behavior of
 * `kloel/channel-transport.providers#TikTokChannelTransport`, which this
 * adapter supersedes under the canonical OmniCore registry.
 *
 * @cluster Marketing/Channels/TikTok
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelCapability,
  ChannelDispatchPort,
  ChannelKind,
  ChannelSendInput,
  ChannelSendResult,
} from '../../../common/channel-dispatch/channel-dispatch.port';

const TIKTOK_OUTBOUND_BLOCKED_REASON =
  'TikTok não suporta envio outbound programático. Apenas recebimento de mensagens via webhook está disponível.';

@Injectable()
export class TikTokDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.TIKTOK;

  private readonly logger = new Logger(TikTokDispatchAdapter.name);

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    return this.sendMessage(input);
  }

  /** Canonical alias of {@link send} (Wave 21 unification — task d). */
  sendMessage(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.TIKTOK) {
      return Promise.resolve({ success: false, provider: 'tiktok', error: 'wrong channel kind' });
    }
    this.logger.warn(
      `TikTok send blocked — outbound API unsupported. workspace=${input.workspaceId} to=${input.to}`,
    );
    return Promise.resolve({
      success: false,
      provider: 'tiktok',
      error: TIKTOK_OUTBOUND_BLOCKED_REASON,
      blocked: true,
      blockedReason: 'channel_tiktok_outbound_unsupported',
    });
  }

  isConfigured(): boolean {
    return false;
  }

  capability(_workspaceId: string): Promise<ChannelCapability> {
    return Promise.resolve({
      channel: ChannelKind.TIKTOK,
      sendAvailable: false,
      sendBlockedReason:
        'TikTok Business Messaging API não suporta envio outbound programático no momento. O canal está disponível apenas para recebimento de mensagens via webhook.',
      requiredSetup: [],
    });
  }
}
