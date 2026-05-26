/**
 * MarketingChannelsModule — wires the 6 `ChannelDispatchPort` adapters
 * (WhatsApp, Instagram, Messenger, Facebook, Email, Internal-Partnership)
 * into NestJS DI. Per R5 of SEND_MESSAGE_CANONICAL.md, the InternalAdmin
 * channel is intentionally NOT wrapped — `AdminChatService` is a copilot
 * interface, not a channel-send.
 *
 * After import, callers can inject either a specific adapter
 * (`InstagramDispatchAdapter`) or — preferred — the
 * `ChannelDispatchRegistry` which routes by `ChannelKind`.
 *
 * ADR-0012 OmniCore Wave W1.
 *
 * @cluster Marketing/Channels
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 * @see backend/src/common/channel-dispatch/channel-dispatch.registry.ts
 */
import { Module } from '@nestjs/common';
import { InstagramDispatchAdapter } from './instagram/instagram-dispatch.adapter';
import { MessengerDispatchAdapter } from './messenger/messenger-dispatch.adapter';
import { FacebookDispatchAdapter } from './facebook/facebook-dispatch.adapter';
import { EmailDispatchAdapter } from './email/email-dispatch.adapter';
import { InternalPartnershipDispatchAdapter } from './internal-partnership/internal-partnership-dispatch.adapter';
import { WhatsAppDispatchAdapter } from './whatsapp/whatsapp-dispatch.adapter';

const ADAPTERS = [
  WhatsAppDispatchAdapter,
  InstagramDispatchAdapter,
  MessengerDispatchAdapter,
  FacebookDispatchAdapter,
  EmailDispatchAdapter,
  InternalPartnershipDispatchAdapter,
];

@Module({
  providers: [...ADAPTERS],
  exports: [...ADAPTERS],
})
export class MarketingChannelsModule {}
