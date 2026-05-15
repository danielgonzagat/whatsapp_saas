import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import type { MindPerceptEvent } from './mind.types';

@Injectable()
export class MindPerceptionService {
  private readonly logger = StructuredLogger.from(MindPerceptionService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MindPerceptionService initialized`);
  }

  async since(workspaceId: string, watermark: Date): Promise<MindPerceptEvent[]> {
    const [autopilot, messages, sales, orders] = await Promise.all([
      this.readAutopilotEvents(workspaceId, watermark),
      this.readMessages(workspaceId, watermark),
      this.readSales(workspaceId, watermark),
      this.readCheckoutOrders(workspaceId, watermark),
    ]);

    return [...autopilot, ...messages, ...sales, ...orders].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );
  }

  private async readAutopilotEvents(workspaceId: string, since: Date): Promise<MindPerceptEvent[]> {
    const rows = await this.prisma.autopilotEvent.findMany({
      where: { workspaceId, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        contactId: true,
        intent: true,
        action: true,
        status: true,
        meta: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      workspaceId,
      kind: `autopilot.${row.intent}.${row.status}`,
      subject: row.contactId ? `contact:${row.contactId}` : 'workspace',
      payload: {
        action: row.action,
        intent: row.intent,
        meta: this.asJsonObject(row.meta),
        status: row.status,
      },
      occurredAt: row.createdAt,
    }));
  }

  private async readMessages(workspaceId: string, since: Date): Promise<MindPerceptEvent[]> {
    const rows = await this.prisma.message.findMany({
      where: { workspaceId, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        contactId: true,
        direction: true,
        type: true,
        content: true,
        createdAt: true,
        conversation: { select: { channel: true } },
      },
    });

    return rows.map((row) => ({
      workspaceId,
      kind: row.direction === 'INBOUND' ? 'message.received' : 'message.sent',
      subject: row.contactId ? `contact:${row.contactId}` : `message:${row.id}`,
      payload: {
        contentPreview: row.content.slice(0, 240),
        channel: this.normalizeChannel(row.conversation?.channel ?? null),
        messageId: row.id,
        messageType: row.type,
      },
      occurredAt: row.createdAt,
    }));
  }

  private async readSales(workspaceId: string, since: Date): Promise<MindPerceptEvent[]> {
    const rows = await this.prisma.kloelSale.findMany({
      where: { workspaceId, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        leadId: true,
        productName: true,
        amount: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      workspaceId,
      kind: row.status === 'paid' ? 'sale.completed' : `sale.${row.status}`,
      subject: row.leadId ? `lead:${row.leadId}` : `sale:${row.id}`,
      payload: {
        amount: row.amount,
        paymentMethod: row.paymentMethod,
        productName: row.productName,
        status: row.status,
      },
      occurredAt: row.createdAt,
    }));
  }

  private async readCheckoutOrders(workspaceId: string, since: Date): Promise<MindPerceptEvent[]> {
    const rows = await this.prisma.checkoutOrder.findMany({
      where: { workspaceId, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        status: true,
        customerEmail: true,
        paymentMethod: true,
        totalInCents: true,
        utmSource: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      workspaceId,
      kind: row.status === 'PAID' ? 'checkout.paid' : `checkout.${row.status.toLowerCase()}`,
      subject: `order:${row.id}`,
      payload: {
        customerEmail: row.customerEmail,
        paymentMethod: row.paymentMethod,
        priceBand: this.priceBand(row.totalInCents),
        status: row.status,
        utmSource: row.utmSource,
      },
      occurredAt: row.createdAt,
    }));
  }

  private asJsonObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private priceBand(totalInCents: number): string {
    if (totalInCents < 10_000) return 'under_100';
    if (totalInCents < 50_000) return '100_499';
    if (totalInCents < 100_000) return '500_999';
    return '1000_plus';
  }

  private normalizeChannel(channel: string | null): string {
    const normalized = String(channel || '')
      .trim()
      .toLowerCase();
    return normalized || 'unknown';
  }
}
