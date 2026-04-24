import { Injectable } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { PrismaService } from '../prisma/prisma.service';

type UnknownRecord = Record<string, unknown>;

/**
 * Handles all database reads for the Unified Agent context:
 * workspace info, contact data, conversation history, products, and
 * compressed-context persistence.
 */
@Injectable()
export class UnifiedAgentContextDataService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────── helpers ─────────

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
      return String(value);
    return fallback;
  }

  private str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  // ───────── workspace + contact queries ─────────

  async getWorkspaceContext(workspaceId: string): Promise<UnknownRecord> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, providerSettings: true },
    });
    const brandVoice = await this.prisma.kloelMemory.findFirst({
      where: { workspaceId, key: 'brandVoice' },
    });
    return {
      ...workspace,
      brandVoice: (brandVoice?.value as Record<string, unknown>)?.style as string | undefined,
    };
  }

  async getContactContext(workspaceId: string, contactId: string, phone: string) {
    const select = {
      name: true,
      phone: true,
      sentiment: true,
      leadScore: true,
      nextBestAction: true,
      aiSummary: true,
      purchaseProbability: true,
      customFields: true,
      tags: { select: { name: true } },
    };

    if (contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select,
      });
      if (contact) return contact;
    }

    const contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone },
      select,
    });

    return contact || { phone, name: null, sentiment: 'NEUTRAL', leadScore: 0, tags: [] };
  }

  async getConversationHistory(
    workspaceId: string,
    contactId: string,
    limit: number,
    phone?: string,
  ): Promise<ChatCompletionMessageParam[]> {
    const where = contactId
      ? { workspaceId, contactId }
      : phone
        ? { workspaceId, contact: { phone } }
        : null;

    if (!where) return [];

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(limit > 0 ? { take: limit } : {}),
      select: { content: true, direction: true },
    });

    return messages.reverse().map((m) => ({
      role: m.direction === 'INBOUND' ? 'user' : 'assistant',
      content: m.content || '',
    })) as ChatCompletionMessageParam[];
  }

  async buildAndPersistCompressedContext(
    workspaceId: string,
    contactId: string,
    phone: string,
    contact: unknown,
  ): Promise<string | undefined> {
    const where = contactId
      ? { workspaceId, contactId }
      : phone
        ? { workspaceId, contact: { phone } }
        : null;

    if (!where) return undefined;

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { direction: true, content: true, createdAt: true },
    });
    const orderedMessages = [...messages].reverse();
    const lastInbound = [...orderedMessages]
      .reverse()
      .find((message) => message.direction === 'INBOUND');
    const lastOutbound = [...orderedMessages]
      .reverse()
      .find((message) => message.direction === 'OUTBOUND');

    const c: UnknownRecord = this.isRecord(contact) ? contact : {};
    const summary = [
      `Nome preferido: ${this.readText(c.name, phone)}`,
      `Telefone: ${this.readText(c.phone, phone)}`,
      `Sentimento atual: ${this.readText(c.sentiment, 'NEUTRAL')}`,
      `Lead score: ${this.readText(c.leadScore, '0')}`,
      c.purchaseProbability
        ? `Probabilidade de compra: ${this.readText(c.purchaseProbability)}`
        : null,
      c.aiSummary ? `Resumo do CRM: ${this.str(c.aiSummary).trim()}` : null,
      c.nextBestAction ? `Próxima melhor ação: ${this.readText(c.nextBestAction)}` : null,
      lastInbound?.content
        ? `Última mensagem do cliente: ${String(lastInbound.content).trim()}`
        : null,
      lastOutbound?.content
        ? `Última mensagem do agente: ${String(lastOutbound.content).trim()}`
        : null,
      orderedMessages.length
        ? `Histórico recente: ${orderedMessages
            .map(
              (message) =>
                `${message.direction === 'INBOUND' ? 'Cliente' : 'Agente'}: ${String(
                  message.content || '',
                ).trim()}`,
            )
            .filter(Boolean)
            .join(' | ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);

    const key = `compressed_context:${contactId || phone}`;

    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      update: {
        value: {
          summary,
          contactId: contactId || null,
          phone,
          updatedAt: new Date().toISOString(),
        },
        category: 'compressed_context',
        type: 'contact_context',
        content: summary,
        metadata: { contactId: contactId || null, phone, source: 'unified_agent' },
      },
      create: {
        workspaceId,
        key,
        value: {
          summary,
          contactId: contactId || null,
          phone,
          updatedAt: new Date().toISOString(),
        },
        category: 'compressed_context',
        type: 'contact_context',
        content: summary,
        metadata: { contactId: contactId || null, phone, source: 'unified_agent' },
      },
    });

    return summary || undefined;
  }

  async getProducts(workspaceId: string) {
    const memoryProducts = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        OR: [{ type: 'product' }, { category: 'products' }],
      },
      select: { id: true, key: true, value: true, type: true, category: true },
      take: 20,
    });

    const dbProducts = await this.prisma.product.findMany({
      where: { workspaceId, active: true },
      select: { id: true, name: true, price: true, description: true, status: true, active: true },
      take: 20,
    });

    return [
      ...dbProducts.map((p) => ({
        id: p.id,
        value: { name: p.name, price: p.price, description: p.description },
      })),
      ...memoryProducts.filter(
        (m) =>
          !dbProducts.some(
            (d) =>
              (((m.value as Record<string, unknown>)?.name as string) || '').toLowerCase() ===
              d.name.toLowerCase(),
          ),
      ),
    ];
  }
}
