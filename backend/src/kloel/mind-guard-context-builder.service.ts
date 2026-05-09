import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ChannelSendRequest } from './channel-transport.types';
import type { MindActionContext } from './mind-code-native.types';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MindGuardContextBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForSend(
    workspaceId: string,
    request: ChannelSendRequest,
    baseContext: MindActionContext,
  ): Promise<MindActionContext> {
    const contactId = this.readString(baseContext.contactId);
    const since = new Date(Date.now() - DAY_MS);
    const [contact, messagesToday, lastInbound] = await Promise.all([
      contactId
        ? this.prisma.contact.findFirst({
            where: { id: contactId, workspaceId },
            select: { optIn: true, optedOutAt: true },
          })
        : null,
      contactId
        ? this.prisma.message.count({
            where: {
              workspaceId,
              contactId,
              createdAt: { gte: since },
            },
          })
        : null,
      contactId
        ? this.prisma.message.findFirst({
            where: {
              workspaceId,
              contactId,
              direction: 'INBOUND',
              createdAt: { gte: since },
            },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
          })
        : null,
    ]);

    const withinComplianceWindow =
      typeof baseContext.withinComplianceWindow === 'boolean'
        ? baseContext.withinComplianceWindow
        : request.complianceMode === 'reactive' || Boolean(lastInbound);
    const templateApproved =
      typeof baseContext.templateApproved === 'boolean'
        ? baseContext.templateApproved
        : withinComplianceWindow;

    return {
      ...baseContext,
      contactMessagesToday:
        typeof baseContext.contactMessagesToday === 'number'
          ? baseContext.contactMessagesToday
          : (messagesToday ?? baseContext.contactMessagesToday),
      contactOptOut:
        typeof baseContext.contactOptOut === 'boolean'
          ? baseContext.contactOptOut
          : contact
            ? contact.optIn === false || Boolean(contact.optedOutAt)
            : baseContext.contactOptOut,
      templateApproved,
      withinComplianceWindow,
    };
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
