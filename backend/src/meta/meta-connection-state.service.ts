import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ChannelState {
  connected: boolean;
  expiresAt: string | null;
}

export interface InstagramChannelState extends ChannelState {
  accountId: string | null;
  pageId: string | null;
}

export interface FacebookChannelState extends ChannelState {
  pageId: string | null;
}

export interface WhatsAppChannelState extends ChannelState {
  phoneNumberId: string | null;
  businessId: string | null;
}

export interface MetaConnectionState {
  instagram: InstagramChannelState;
  facebook: FacebookChannelState;
  whatsapp: WhatsAppChannelState;
  metaConnected: boolean;
  channel: string | null;
}

const EXPIRED = (expiresAt: Date | null | undefined): boolean =>
  Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());

const ISO = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

@Injectable()
export class MetaConnectionStateService {

  constructor(private readonly prisma: PrismaService) {}

  async forWorkspace(workspaceId: string): Promise<MetaConnectionState> {
    const connection = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
      select: {
        channel: true,
        accessToken: true,
        tokenExpiresAt: true,
        pageId: true,
        instagramAccountId: true,
        whatsappPhoneNumberId: true,
        whatsappBusinessId: true,
      },
    });

    if (!connection) {
      return {
        instagram: { connected: false, accountId: null, pageId: null, expiresAt: null },
        facebook: { connected: false, pageId: null, expiresAt: null },
        whatsapp: { connected: false, phoneNumberId: null, businessId: null, expiresAt: null },
        metaConnected: false,
        channel: null,
      };
    }

    const tokenValid = Boolean(connection.accessToken) && !EXPIRED(connection.tokenExpiresAt);

    const instagramConnected = tokenValid && Boolean(connection.instagramAccountId);
    const facebookConnected = tokenValid && Boolean(connection.pageId);
    const whatsappConnected = tokenValid && Boolean(connection.whatsappPhoneNumberId);

    return {
      instagram: {
        connected: instagramConnected,
        accountId: connection.instagramAccountId || null,
        pageId: connection.pageId || null,
        expiresAt: ISO(connection.tokenExpiresAt),
      },
      facebook: {
        connected: facebookConnected,
        pageId: connection.pageId || null,
        expiresAt: ISO(connection.tokenExpiresAt),
      },
      whatsapp: {
        connected: whatsappConnected,
        phoneNumberId: connection.whatsappPhoneNumberId || null,
        businessId: connection.whatsappBusinessId || null,
        expiresAt: ISO(connection.tokenExpiresAt),
      },
      metaConnected: tokenValid,
      channel: connection.channel || null,
    };
  }
}
