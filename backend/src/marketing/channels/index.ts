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
export { WhatsAppDispatchAdapter } from './whatsapp';
export { InstagramDispatchAdapter } from './instagram';
export { MessengerDispatchAdapter } from './messenger';
export { FacebookDispatchAdapter } from './facebook';
export { EmailDispatchAdapter } from './email';
export { InternalPartnershipDispatchAdapter } from './internal-partnership';
export { MarketingChannelsModule } from './marketing-channels.module';
