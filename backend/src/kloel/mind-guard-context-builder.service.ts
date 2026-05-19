import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import type { ChannelSendRequest } from './channel-transport.types';
import type { MindActionContext } from './mind-code-native.types';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MindGuardContextBuilderService {
  private readonly logger = StructuredLogger.from(MindGuardContextBuilderService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MindGuardContextBuilderService initialized`);
  }

  async buildForSend(
    workspaceId: string,
    request: ChannelSendRequest,
    baseContext: MindActionContext,
  ): Promise<MindActionContext> {
    const contactContext = await this.buildContactContext(workspaceId, baseContext);
    const withinComplianceWindow =
      typeof baseContext.withinComplianceWindow === 'boolean'
        ? baseContext.withinComplianceWindow
        : request.complianceMode === 'reactive' || Boolean(contactContext.lastInbound);
    const templateApproved =
      typeof baseContext.templateApproved === 'boolean'
        ? baseContext.templateApproved
        : withinComplianceWindow;

    return {
      ...baseContext,
      ...contactContext.context,
      templateApproved,
      withinComplianceWindow,
    };
  }

  async buildForDiscount(
    workspaceId: string,
    baseContext: MindActionContext,
  ): Promise<MindActionContext> {
    const contactContext = await this.buildContactContext(workspaceId, baseContext);
    return {
      ...baseContext,
      ...contactContext.context,
      maxDiscountPercent:
        typeof baseContext.maxDiscountPercent === 'number' ? baseContext.maxDiscountPercent : 30,
      minMarginPercent:
        typeof baseContext.minMarginPercent === 'number' ? baseContext.minMarginPercent : 0,
    };
  }

  async buildForPayment(
    workspaceId: string,
    baseContext: MindActionContext,
  ): Promise<MindActionContext> {
    const contactContext = await this.buildContactContext(workspaceId, baseContext);
    const paymentAmount =
      typeof baseContext.paymentAmount === 'number' ? baseContext.paymentAmount : undefined;
    const paymentProcessed =
      typeof baseContext.paymentProcessed === 'boolean'
        ? baseContext.paymentProcessed
        : await this.hasProcessedPayment(workspaceId, baseContext);
    return {
      ...baseContext,
      ...contactContext.context,
      maxPaymentAmount:
        typeof baseContext.maxPaymentAmount === 'number' ? baseContext.maxPaymentAmount : 5000,
      ...(paymentAmount !== undefined ? { paymentAmount } : {}),
      paymentProcessed,
    };
  }

  async buildForTransfer(
    workspaceId: string,
    baseContext: MindActionContext,
  ): Promise<MindActionContext> {
    const contactContext = await this.buildContactContext(workspaceId, baseContext);
    const contactId = this.readString(baseContext.contactId);
    const escalationInProgress =
      typeof baseContext.escalationInProgress === 'boolean'
        ? baseContext.escalationInProgress
        : contactId
          ? await this.hasHumanConversation(workspaceId, contactId)
          : false;
    return {
      ...baseContext,
      ...contactContext.context,
      escalationInProgress,
      humanAvailable:
        typeof baseContext.humanAvailable === 'boolean' ? baseContext.humanAvailable : true,
    };
  }

  async buildForBroadcast(
    workspaceId: string,
    baseContext: MindActionContext,
  ): Promise<MindActionContext> {
    const contactContext = await this.buildContactContext(workspaceId, baseContext);
    return {
      ...baseContext,
      ...contactContext.context,
      campaignActive:
        typeof baseContext.campaignActive === 'boolean' ? baseContext.campaignActive : true,
      campaignBudgetExhausted:
        typeof baseContext.campaignBudgetExhausted === 'boolean'
          ? baseContext.campaignBudgetExhausted
          : false,
      withinComplianceWindow:
        typeof baseContext.withinComplianceWindow === 'boolean'
          ? baseContext.withinComplianceWindow
          : false,
    };
  }

  private async buildContactContext(
    workspaceId: string,
    baseContext: MindActionContext,
  ): Promise<{ context: MindActionContext; lastInbound: boolean }> {
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

    return {
      context: {
        ...(typeof baseContext.contactMessagesToday === 'number'
          ? { contactMessagesToday: baseContext.contactMessagesToday }
          : messagesToday !== null
            ? { contactMessagesToday: messagesToday }
            : baseContext.contactMessagesToday !== undefined
              ? { contactMessagesToday: baseContext.contactMessagesToday }
              : {}),
        ...(typeof baseContext.contactOptOut === 'boolean'
          ? { contactOptOut: baseContext.contactOptOut }
          : contact
            ? { contactOptOut: contact.optIn === false || Boolean(contact.optedOutAt) }
            : baseContext.contactOptOut !== undefined
              ? { contactOptOut: baseContext.contactOptOut }
              : {}),
      },
      lastInbound: Boolean(lastInbound),
    };
  }

  private async hasHumanConversation(workspaceId: string, contactId: string): Promise<boolean> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { workspaceId, contactId, mode: 'HUMAN' },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    return Boolean(conversation);
  }

  private async hasProcessedPayment(
    workspaceId: string,
    baseContext: MindActionContext,
  ): Promise<boolean> {
    const externalPaymentId = this.readString(baseContext.paymentExternalId);
    if (!externalPaymentId) return false;
    const sale = await this.prisma.kloelSale.findFirst({
      where: {
        workspaceId,
        externalPaymentId,
        status: { in: ['paid', 'completed', 'approved'] },
      },
      select: { id: true },
    });
    return Boolean(sale);
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
