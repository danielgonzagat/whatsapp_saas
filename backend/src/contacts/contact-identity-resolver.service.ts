import { Injectable, Logger } from '@nestjs/common';
import { normalizeChannelIdentifierChannel } from './channel-identifier.service';
import { PrismaService } from '../prisma/prisma.service';

export interface IdentityResolveParams {
  workspaceId: string;
  channel: string;
  externalId: string;
  phone?: string;
  email?: string;
  socialHandle?: string;
}

export interface IdentityResolveResult {
  contactId: string;
  channelIdentifierId: string;
  wasCreated: boolean;
  wasResolved: boolean;
  resolvedFromContactId?: string;
  resolveReason?: string;
}

@Injectable()
export class ContactIdentityResolverService {
  private readonly logger = new Logger(ContactIdentityResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(params: IdentityResolveParams): Promise<IdentityResolveResult> {
    const { workspaceId, channel, externalId, phone, email, socialHandle } = params;
    const normalizedChannel = normalizeChannelIdentifierChannel(channel);

    const existingIdentifier = await this.prisma.channelIdentifier.findUnique({
      where: {
        workspaceId_channel_value: {
          workspaceId,
          channel: normalizedChannel,
          value: externalId,
        },
      },
      include: { contact: true },
    });

    if (existingIdentifier) {
      return {
        contactId: existingIdentifier.contactId,
        channelIdentifierId: existingIdentifier.id,
        wasCreated: false,
        wasResolved: false,
      };
    }

    // Cross-channel match by phone — look for WHATSAPP channel identifier
    if (phone) {
      const match = await this.findCrossChannelMatch(workspaceId, phone, 'WHATSAPP');
      if (match) {
        return this.linkAndReturn(match, workspaceId, normalizedChannel, externalId, 'phone_match');
      }
    }

    // Cross-channel match by email
    if (email) {
      const match = await this.findCrossChannelMatch(workspaceId, email, 'EMAIL');
      if (match) {
        return this.linkAndReturn(match, workspaceId, normalizedChannel, externalId, 'email_match');
      }
    }

    // Cross-channel match by social handle (Instagram)
    if (socialHandle) {
      const match = await this.findCrossChannelMatch(workspaceId, socialHandle, 'INSTAGRAM');
      if (match) {
        return this.linkAndReturn(match, workspaceId, normalizedChannel, externalId, 'social_handle_match');
      }
    }

    // No match — create new contact with channel identifier
    return this.createContact(workspaceId, normalizedChannel, externalId);
  }

  private async findCrossChannelMatch(
    workspaceId: string,
    value: string,
    channel: string,
  ) {
    const identifier = await this.prisma.channelIdentifier.findFirst({
      where: {
        workspaceId,
        channel,
        value,
        verifiedAt: { not: null },
      },
      include: { contact: true },
      orderBy: { verifiedAt: 'desc' },
    });

    return identifier ?? null;
  }

  private async linkAndReturn(
    match: { contactId: string; contact: { id: string; phone: string } },
    workspaceId: string,
    channel: string,
    value: string,
    reason: string,
  ): Promise<IdentityResolveResult> {
    const identifier = await this.prisma.channelIdentifier.create({
      data: {
        channel,
        value,
        contactId: match.contactId,
        workspaceId,
        isPrimary: false,
      },
    });

    this.logger.log(
      `Cross-channel identity resolved: ${channel}:${value} linked to ${match.contactId} (${reason})`,
    );

    return {
      contactId: match.contactId,
      channelIdentifierId: identifier.id,
      wasCreated: false,
      wasResolved: true,
      resolvedFromContactId: match.contactId,
      resolveReason: reason,
    };
  }

  private async createContact(
    workspaceId: string,
    channel: string,
    value: string,
  ): Promise<IdentityResolveResult> {
    const contact = await this.prisma.contact.create({
      data: {
        workspaceId,
        phone: `${channel.toLowerCase()}:${value}`,
      },
    });

    const identifier = await this.prisma.channelIdentifier.create({
      data: {
        channel,
        value,
        contactId: contact.id,
        workspaceId,
        isPrimary: true,
      },
    });

    return {
      contactId: contact.id,
      channelIdentifierId: identifier.id,
      wasCreated: true,
      wasResolved: false,
    };
  }
}
