import { Injectable } from '@nestjs/common';
import {
  ChannelIdentifierService,
  ResolvedContact,
  normalizeChannelIdentifierChannel,
} from '../contacts/channel-identifier.service';
import { type NormalizedMessage } from '../inbox/omnichannel.helpers';

export { ResolvedContact };

@Injectable()
export class OmnichannelContactResolutionService {
  constructor(private readonly channelIdentifier: ChannelIdentifierService) {}

  resolveFromMessage(
    msg: NormalizedMessage,
    options?: { name?: string },
  ): Promise<ResolvedContact> {
    const channel = msg.channel;
    const value = this.extractChannelValue(channel, msg.from, msg.externalId);

    const resolvedName = options?.name || msg.fromName;
    return this.channelIdentifier.resolve(channel, value, msg.workspaceId, {
      ...(resolvedName !== undefined ? { name: resolvedName } : {}),
      isPrimary: true,
      metadata: {
        rawFrom: msg.from,
        rawExternalId: msg.externalId,
        channel: msg.channel,
      },
    });
  }

  async findExisting(
    channel: string,
    from: string,
    externalId: string,
    workspaceId: string,
  ): Promise<ResolvedContact | null> {
    const value = this.extractChannelValue(channel, from, externalId);
    return this.channelIdentifier.findContactByChannel(channel, value, workspaceId);
  }

  linkChannelToContact(
    channel: string,
    from: string,
    externalId: string,
    contactId: string,
    workspaceId: string,
  ): ReturnType<ChannelIdentifierService['linkIdentifier']> {
    const value = this.extractChannelValue(channel, from, externalId);
    return this.channelIdentifier.linkIdentifier(channel, value, contactId, workspaceId, {
      isPrimary: false,
    });
  }

  private extractChannelValue(channel: string, from: string, externalId: string): string {
    const normalizedChannel = normalizeChannelIdentifierChannel(channel);
    if (normalizedChannel === 'WHATSAPP' || normalizedChannel === 'EMAIL') {
      return from;
    }
    if (normalizedChannel === 'INSTAGRAM' || normalizedChannel === 'MESSENGER') {
      return externalId || from;
    }
    return externalId || from || 'unknown';
  }
}
