import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MergeContactsParams {
  workspaceId: string;
  sourceContactId: string;
  targetContactId: string;
  matchReason: string;
  confidence?: number;
  mergedBy?: string;
}

export interface MergeContactsResult {
  linkId: string;
  wasLinked: boolean;
}

@Injectable()
export class ContactIdentityMergeService {
  private readonly logger = new Logger(ContactIdentityMergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async mergeContacts(params: MergeContactsParams): Promise<MergeContactsResult> {
    const { workspaceId, sourceContactId, targetContactId, matchReason, confidence, mergedBy } =
      params;

    if (sourceContactId === targetContactId) {
      throw new Error('Cannot merge a contact with itself');
    }

    const existing = await this.prisma.contactIdentityLink.findUnique({
      where: {
        workspaceId_contactId_linkedContactId: {
          workspaceId,
          contactId: targetContactId,
          linkedContactId: sourceContactId,
        },
      },
    });

    if (existing) {
      return { linkId: existing.id, wasLinked: false };
    }

    const reverse = await this.prisma.contactIdentityLink.findUnique({
      where: {
        workspaceId_contactId_linkedContactId: {
          workspaceId,
          contactId: sourceContactId,
          linkedContactId: targetContactId,
        },
      },
    });

    if (reverse) {
      return { linkId: reverse.id, wasLinked: false };
    }

    const link = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contactIdentityLink.create({
        data: {
          workspaceId,
          contactId: targetContactId,
          linkedContactId: sourceContactId,
          confidence: confidence ?? 1.0,
          matchReason,
          merged: true,
          mergedAt: new Date(),
          mergedBy: mergedBy ?? null,
        },
      });

      await tx.channelIdentifier.updateMany({
        where: { contactId: sourceContactId, workspaceId },
        data: { contactId: targetContactId },
      });

      await tx.message.updateMany({
        where: { contactId: sourceContactId, workspaceId },
        data: { contactId: targetContactId },
      });

      await tx.conversation.updateMany({
        where: { contactId: sourceContactId, workspaceId },
        data: { contactId: targetContactId },
      });

      await tx.followUp.updateMany({
        where: { contactId: sourceContactId, workspaceId },
        data: { contactId: targetContactId },
      });

      await tx.deal.updateMany({
        where: { contactId: sourceContactId },
        data: { contactId: targetContactId },
      });

      await tx.flowExecution.updateMany({
        where: { contactId: sourceContactId, workspaceId },
        data: { contactId: targetContactId },
      });

      await tx.autopilotEvent.updateMany({
        where: { contactId: sourceContactId, workspaceId },
        data: { contactId: targetContactId },
      });

      await tx.checkoutSocialLead.updateMany({
        where: { contactId: sourceContactId, workspaceId },
        data: { contactId: targetContactId },
      });

      return created;
    });

    this.logger.log(
      `Contacts merged: ${sourceContactId} -> ${targetContactId} (${matchReason}, confidence=${confidence ?? 1.0})`,
    );

    return { linkId: link.id, wasLinked: true };
  }
}
