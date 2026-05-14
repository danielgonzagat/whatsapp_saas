import {  Injectable, Logger } from '@nestjs/common';
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

const ISO = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

@Injectable()
export class MetaConnectionStateService {
  private readonly logger = new Logger(MetaConnectionStateService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MetaConnectionStateService initialized`);}

  async forWorkspace(workspaceId: string): Promise<MetaConnectionState> {
    const connections = await this.prisma.metaConnection.findMany({
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

    if (connections.length === 0) {
      return {
        instagram: { connected: false, accountId: null, pageId: null, expiresAt: null },
        facebook: { connected: false, pageId: null, expiresAt: null },
        whatsapp: { connected: false, phoneNumberId: null, businessId: null, expiresAt: null },
        metaConnected: false,
        channel: null,
      };
    }

    const anyTokenValid = connections.some(
      (c) => Boolean(c.accessToken) && !EXPIRED(c.tokenExpiresAt),
    );

    const instagramRow = connections.find(
      (c) => c.channel === 'instagram' && Boolean(c.accessToken) && !EXPIRED(c.tokenExpiresAt),
    );
    const instagramConnected = Boolean(instagramRow?.instagramAccountId);

    const facebookRow = connections.find(
      (c) => c.channel === 'facebook' && Boolean(c.accessToken) && !EXPIRED(c.tokenExpiresAt),
    );
    const facebookConnected = Boolean(facebookRow?.pageId);

    const whatsappRow = connections.find(
      (c) => c.channel === 'whatsapp' && Boolean(c.accessToken) && !EXPIRED(c.tokenExpiresAt),
    );
    const whatsappConnected = Boolean(whatsappRow?.whatsappPhoneNumberId);

    const primaryChannel = connections[0]?.channel || null;

    return {
      instagram: {
        connected: instagramConnected,
        accountId: instagramRow?.instagramAccountId || null,
        pageId: instagramRow?.pageId || null,
        expiresAt: ISO(instagramRow?.tokenExpiresAt),
      },
      facebook: {
        connected: facebookConnected,
        pageId: facebookRow?.pageId || null,
        expiresAt: ISO(facebookRow?.tokenExpiresAt),
      },
      whatsapp: {
        connected: whatsappConnected,
        phoneNumberId: whatsappRow?.whatsappPhoneNumberId || null,
        businessId: whatsappRow?.whatsappBusinessId || null,
        expiresAt: ISO(whatsappRow?.tokenExpiresAt),
      },
      metaConnected: anyTokenValid,
      channel: primaryChannel,
    };
  }
}
