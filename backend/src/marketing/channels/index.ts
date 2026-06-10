/**
 * Marketing/Channels — canonical OmniCore channel dispatch adapters.
 *
 * Per ADR-0012, `backend/src/marketing/channels/<channel>/` is the
 * canonical home for adapters implementing `ChannelDispatchPort`. Each
 * adapter delegates to the existing channel-specific service (Meta SDK,
 * WAHA, IMAP/Gmail/Microsoft, etc.) — providing one common shape behind
 * `ChannelDispatchRegistry.send()`.
 *
 * Per R5 of SEND_MESSAGE_CANONICAL.md, the InternalAdmin channel is
 * intentionally NOT wrapped — AdminChatService is a copilot interface,
 * not a channel-send.
 *
 * @cluster Marketing/Channels
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 */
export { WhatsAppDispatchAdapter } from './whatsapp/whatsapp-dispatch.adapter';
export { InstagramDispatchAdapter } from './instagram/instagram-dispatch.adapter';
export { MessengerDispatchAdapter } from './messenger/messenger-dispatch.adapter';
export { FacebookDispatchAdapter } from './facebook/facebook-dispatch.adapter';
export { EmailDispatchAdapter, TransactionalEmailDispatchAdapter } from './email';
export { TikTokDispatchAdapter } from './tiktok';
export { InternalPartnershipDispatchAdapter } from './internal-partnership/internal-partnership-dispatch.adapter';
export { MarketingChannelsModule } from './marketing-channels.module';
