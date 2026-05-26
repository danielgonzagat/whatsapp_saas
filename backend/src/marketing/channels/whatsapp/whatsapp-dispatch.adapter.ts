import { Injectable } from '@nestjs/common';
import {
  ChannelDispatchPort,
  ChannelKind,
  type ChannelSendInput,
  type ChannelSendResult,
  type WhatsAppSendInput,
} from '../../../common/channel-dispatch/channel-dispatch.port';
import { WhatsappMessageDispatcherService } from '../../../whatsapp/whatsapp-message-dispatcher.service';

type DispatcherOpts = NonNullable<
  Parameters<WhatsappMessageDispatcherService['sendMessage']>[3]
>;

@Injectable()
export class WhatsAppDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.WHATSAPP;

  constructor(
    private readonly dispatcher: WhatsappMessageDispatcherService,
  ) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.WHATSAPP) {
      return { success: false, error: 'wrong channel kind' };
    }
    // TypeScript narrows to WhatsAppSendInput after the discriminant guard
    const wi = input;
    const opts = this.buildOpts(wi);
    const result = await this.dispatcher.sendMessage(
      wi.workspaceId,
      wi.to,
      wi.message,
      opts,
    );
    return this.mapResult(result, wi);
  }

  isConfigured(): boolean {
    return true;
  }

  private buildOpts(input: WhatsAppSendInput): DispatcherOpts | undefined {
    const o: DispatcherOpts = {};
    if (input.mediaUrl !== undefined) o.mediaUrl = input.mediaUrl;
    if (input.mediaType !== undefined) o.mediaType = input.mediaType;
    if (input.caption !== undefined) o.caption = input.caption;
    if (input.quotedMessageId !== undefined) o.quotedMessageId = input.quotedMessageId;
    if (input.externalId !== undefined) o.externalId = input.externalId;
    if (input.complianceMode !== undefined) o.complianceMode = input.complianceMode;
    if (input.forceDirect !== undefined) o.forceDirect = input.forceDirect;
    return Object.keys(o).length > 0 ? o : undefined;
  }

  private mapResult(
    result: Awaited<ReturnType<WhatsappMessageDispatcherService['sendMessage']>>,
    input: WhatsAppSendInput,
  ): ChannelSendResult {
    if ('error' in result && result.error) {
      if ('message' in result) {
        return { success: false, error: result.message };
      }
      return { success: false, error: result.error };
    }
    return {
      success: true,
      messageId:
        'messageId' in result && result.messageId != null
          ? String(result.messageId)
          : undefined,
      queued: 'queued' in result && result.queued === true,
      delivery:
        'delivery' in result && result.delivery === 'queued' ? 'queued' : 'direct',
      externalId: input.externalId,
    };
  }
}
