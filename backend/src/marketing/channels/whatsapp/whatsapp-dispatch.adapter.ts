/**
 * WhatsAppDispatchAdapter — implements `ChannelDispatchPort` for the
 * WhatsApp channel. Delegates to `WhatsappService.sendMessage` (the
 * public facade exported by `WhatsappModule`), which internally routes
 * to the message dispatcher + provider registry chain.
 *
 * ADR-0012 OmniCore Wave W1.
 *
 * @cluster Marketing/Channels/WhatsApp
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable } from '@nestjs/common';
import {
  ChannelDispatchPort,
  ChannelKind,
  type ChannelSendInput,
  type ChannelSendResult,
  type WhatsAppSendInput,
} from '../../../common/channel-dispatch/channel-dispatch.port';
import { WhatsappService } from '../../../whatsapp/whatsapp.service';

type WhatsappSendOpts = NonNullable<Parameters<WhatsappService['sendMessage']>[3]>;

@Injectable()
export class WhatsAppDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.WHATSAPP;

  constructor(private readonly whatsapp: WhatsappService) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.WHATSAPP) {
      return { success: false, error: 'wrong channel kind' };
    }
    const opts = this.buildOpts(input);
    const result = await this.whatsapp.sendMessage(
      input.workspaceId,
      input.to,
      input.message,
      opts,
    );
    return this.mapResult(result, input);
  }

  isConfigured(): boolean {
    return Boolean(this.whatsapp);
  }

  private buildOpts(input: WhatsAppSendInput): WhatsappSendOpts | undefined {
    const o: WhatsappSendOpts = {};
    if (input.mediaUrl !== undefined) {o.mediaUrl = input.mediaUrl;}
    if (input.mediaType !== undefined) {o.mediaType = input.mediaType;}
    if (input.caption !== undefined) {o.caption = input.caption;}
    if (input.quotedMessageId !== undefined) {o.quotedMessageId = input.quotedMessageId;}
    if (input.externalId !== undefined) {o.externalId = input.externalId;}
    if (input.complianceMode !== undefined) {o.complianceMode = input.complianceMode;}
    if (input.forceDirect !== undefined) {o.forceDirect = input.forceDirect;}
    return Object.keys(o).length > 0 ? o : undefined;
  }

  private mapResult(
    result: Awaited<ReturnType<WhatsappService['sendMessage']>>,
    input: WhatsAppSendInput,
  ): ChannelSendResult {
    const obj = (result ?? {}) as Record<string, unknown>;
    const success = obj.success !== false && !obj.error;
    if (!success) {
      const errMsg =
        typeof obj.error === 'string'
          ? obj.error
          : typeof obj.message === 'string'
            ? obj.message
            : 'whatsapp_send_failed';
      const failure: ChannelSendResult = {
        success: false,
        provider: 'whatsapp',
        error: errMsg,
      };
      if (typeof obj.blocked === 'boolean') {failure.blocked = obj.blocked;}
      if (typeof obj.blockedReason === 'string') {failure.blockedReason = obj.blockedReason;}
      return failure;
    }
    const messageId =
      typeof obj.messageId === 'string'
        ? obj.messageId
        : typeof obj.externalId === 'string'
          ? obj.externalId
          : typeof obj.id === 'string'
            ? obj.id
            : undefined;
    const queued = obj.queued === true;
    const ok: ChannelSendResult = {
      success: true,
      provider: 'whatsapp',
      delivery: queued ? 'queued' : 'direct',
      queued,
    };
    if (messageId) {ok.messageId = messageId;}
    if (input.externalId) {ok.externalId = input.externalId;}
    else if (messageId) {ok.externalId = messageId;}
    return ok;
  }
}
