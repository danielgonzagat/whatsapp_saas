/**
 * InternalPartnershipDispatchAdapter — implements `ChannelDispatchPort` for
 * the internal partnership chat channel. This is a DB-only insert (no
 * external provider): the message is persisted to `partnerMessage` with
 * `senderType: 'OWNER'`.
 *
 * ADR-0012 OmniCore Wave W1. Delegates to the existing
 * `partnerships.chat.helpers#sendMessage(prisma, partnerId, content,
 * senderId, senderName)`.
 *
 * @cluster Marketing/Channels/InternalPartnership
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable } from '@nestjs/common';
import {
  ChannelDispatchPort,
  ChannelKind,
  ChannelSendInput,
  ChannelSendResult,
} from '../../../common/channel-dispatch/channel-dispatch.port';
import { sendMessage as persistPartnershipMessage } from '../../../partnerships/partnerships.chat.helpers';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class InternalPartnershipDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.INTERNAL_PARTNERSHIP;

  constructor(private readonly prisma: PrismaService) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.INTERNAL_PARTNERSHIP) {
      return { success: false, error: 'wrong channel kind' };
    }
    try {
      const row = await persistPartnershipMessage(
        this.prisma,
        input.partnerId,
        input.content,
        input.senderId,
        input.senderName,
      );
      const id = (row as { id?: string } | null)?.id;
      return {
        success: true,
        provider: 'internal-partnership',
        delivery: 'direct',
        ...(id ? { messageId: id, externalId: id } : {}),
      };
    } catch (error) {
      return {
        success: false,
        provider: 'internal-partnership',
        error: error instanceof Error ? error.message : 'partnership_send_failed',
      };
    }
  }

  isConfigured(): boolean {
    return Boolean(this.prisma);
  }
}
