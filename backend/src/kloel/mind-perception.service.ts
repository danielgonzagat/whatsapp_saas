import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MindPerceptEvent } from './mind.types';

type AutopilotEventRow = {
  action: string;
  contactId: string | null;
  createdAt: Date;
  intent: string;
  meta: unknown;
  status: string;
};

type MessageRow = {
  channel: string | null;
  contactId: string | null;
  content: string;
  createdAt: Date;
  direction: string;
  id: string;
  type: string;
};

type SaleRow = {
  amount: number;
  createdAt: Date;
  id: string;
  leadId: string | null;
  paymentMethod: string | null;
  productName: string | null;
  status: string;
};

type CheckoutOrderRow = {
  createdAt: Date;
  customerEmail: string | null;
  id: string;
  paymentMethod: string;
  status: string;
  totalInCents: number;
  utmSource: string | null;
};

@Injectable()
export class MindPerceptionService {
  constructor(private readonly prisma: PrismaService) {}

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
    const rows = await this.prisma.$queryRaw<AutopilotEventRow[]>`
      SELECT "contactId", intent, action, status, meta, "createdAt"
      FROM "RAC_AutopilotEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "createdAt" > ${since}
      ORDER BY "createdAt" ASC
      LIMIT 500
    `;

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
    const rows = await this.prisma.$queryRaw<MessageRow[]>`
      SELECT m.id, m."contactId", m.direction, m.type, m.content, m."createdAt", c.channel
      FROM "RAC_Message" m
      LEFT JOIN "RAC_Conversation" c ON c.id = m."conversationId"
      WHERE m."workspaceId" = ${workspaceId}
        AND m."createdAt" > ${since}
      ORDER BY m."createdAt" ASC
      LIMIT 500
    `;

    return rows.map((row) => ({
      workspaceId,
      kind: row.direction === 'INBOUND' ? 'message.received' : 'message.sent',
      subject: row.contactId ? `contact:${row.contactId}` : `message:${row.id}`,
      payload: {
        contentPreview: row.content.slice(0, 240),
        channel: this.normalizeChannel(row.channel),
        messageId: row.id,
        messageType: row.type,
      },
      occurredAt: row.createdAt,
    }));
  }

  private async readSales(workspaceId: string, since: Date): Promise<MindPerceptEvent[]> {
    const rows = await this.prisma.$queryRaw<SaleRow[]>`
      SELECT id, "leadId", "productName", amount, status, "paymentMethod", "createdAt"
      FROM "RAC_KloelSale"
      WHERE "workspaceId" = ${workspaceId}
        AND "createdAt" > ${since}
      ORDER BY "createdAt" ASC
      LIMIT 500
    `;

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
    const rows = await this.prisma.$queryRaw<CheckoutOrderRow[]>`
      SELECT id, status, "customerEmail", "paymentMethod", "totalInCents", "utmSource", "createdAt"
      FROM "RAC_CheckoutOrder"
      WHERE "workspaceId" = ${workspaceId}
        AND "createdAt" > ${since}
      ORDER BY "createdAt" ASC
      LIMIT 500
    `;

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
