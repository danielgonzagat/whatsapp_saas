import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import type { MindPerceptEvent } from '../../mind.types';

export interface PerceiveInput {
  source: string;
  channel: string;
  raw: string;
  workspaceId: string;
}

export interface Perception {
  subject: string;
  intent: string;
  salience: number;
  semanticContext: Record<string, unknown>;
}

@Injectable()
export class MindPerceptionService {
  private readonly logger = StructuredLogger.from(MindPerceptionService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MindPerceptionService initialized`);
  }

  /**
   * Interpret a raw signal (chat, webhook, scheduled event) into a
   * structured Perception — subject, intent, salience, and semantic context.
   *
   * PI-K16-C: wired into buildMindSignals so the LLM receives richer
   * structured input alongside the raw userMessage.
   */
  perceive(input: PerceiveInput): Perception {
    const normalized = input.raw.toLowerCase().trim();
    const intent = this.classifyIntent(normalized);
    const salience = this.estimateSalience(normalized);
    const subject = this.extractSubject(normalized, intent);

    return {
      subject,
      intent,
      salience,
      semanticContext: {
        source: input.source,
        channel: input.channel,
        workspaceId: input.workspaceId,
        length: input.raw.length,
        hasQuestion: /[?¿]/.test(input.raw),
        hasUrgency: /\b(urgente|rápido|agora|imediato|já|agora mesmo)\b/i.test(input.raw),
      },
    };
  }

  async since(workspaceId: string, watermark: Date): Promise<MindPerceptEvent[]> {
    const [autopilot, messages, sales, orders, products] = await Promise.all([
      this.readAutopilotEvents(workspaceId, watermark),
      this.readMessages(workspaceId, watermark),
      this.readSales(workspaceId, watermark),
      this.readCheckoutOrders(workspaceId, watermark),
      this.readProducts(workspaceId, watermark),
    ]);

    return [...autopilot, ...messages, ...sales, ...orders, ...products].sort(
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

  private async readProducts(workspaceId: string, since: Date): Promise<MindPerceptEvent[]> {
    const rows = await this.prisma.product.findMany({
      where: { workspaceId, updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
      take: 500,
      select: {
        id: true,
        name: true,
        price: true,
        currency: true,
        category: true,
        format: true,
        status: true,
        active: true,
        featured: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return rows.map((row) => ({
      workspaceId,
      kind: row.createdAt > since ? 'product.created' : 'product.updated',
      subject: `product:${row.id}`,
      payload: {
        productId: row.id,
        name: row.name,
        price: row.price,
        currency: row.currency,
        category: row.category,
        format: row.format,
        status: row.status,
        active: row.active,
        featured: row.featured,
      },
      occurredAt: row.updatedAt,
    }));
  }

  private asJsonObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private priceBand(totalInCents: number): string {
    if (totalInCents < 10_000) {
      return 'under_100';
    }
    if (totalInCents < 50_000) {
      return '100_499';
    }
    if (totalInCents < 100_000) {
      return '500_999';
    }
    return '1000_plus';
  }

  private normalizeChannel(channel: string | null): string {
    const normalized = String(channel || '')
      .trim()
      .toLowerCase();
    return normalized || 'unknown';
  }

  // ── perceive() helpers ──────────────────────────────────────────

  private classifyIntent(normalized: string): string {
    if (/\b(oi|olá|ola|hey|bom dia|boa tarde|boa noite|hi|hello)\b/i.test(normalized)) {
      return 'greeting';
    }
    if (/\b(comprar|quero|comprar|preço|valor|custa|quanto|pagamento|pagar|carrinho|checkout)\b/i.test(normalized)) {
      return 'purchase_intent';
    }
    if (/\b(reclamação|reclamar|problema|não funciona|erro|bug|quebrado|defeito|ruim|péssimo|horrível)\b/i.test(normalized)) {
      return 'complaint';
    }
    if (/\b(ajuda|help|socorro|como|duvida|dúvida|não sei|não consigo|como faço|explica|tutorial)\b/i.test(normalized)) {
      return 'support_request';
    }
    if (/\b(obrigad[oa]|valeu|brigad[oa]|thanks|thank|show|legal|top|ótimo|excelente|perfeito|incrível)\b/i.test(normalized)) {
      return 'gratitude';
    }
    if (/\b(cancelar|cancelamento|reembolso|devolver|estorno|desistência)\b/i.test(normalized)) {
      return 'cancellation';
    }
    if (normalized.length < 15 && !normalized.includes(' ')) {
      return 'fragment';
    }
    return 'statement';
  }

  private estimateSalience(normalized: string): number {
    let score = 0.3;
    if (/\b(urgente|rápido|agora|imediato|já|emergência)\b/i.test(normalized)) score += 0.3;
    if (/!{2,}/.test(normalized) || /[A-ZÀ-Ú]{4,}/.test(normalized)) score += 0.15;
    if (/[?¿]/.test(normalized)) score += 0.1;
    if (/\b(reclamação|problema|erro|ódio|raiva|péssimo|horrível|processo|procon|reclame aqui)\b/i.test(normalized)) score += 0.15;
    if (/\b(comprar|quero|pagamento|pagar|carrinho)\b/i.test(normalized)) score += 0.1;
    if (normalized.length > 200) score += 0.05;
    return Math.min(score, 1.0);
  }

  private extractSubject(normalized: string, intent: string): string {
    if (intent === 'greeting') return 'social_greeting';
    if (intent === 'gratitude') return 'social_gratitude';
    if (intent === 'fragment') return 'unclear';

    const topicPatterns: Array<{ re: RegExp; label: string }> = [
      { re: /\b(preço|valor|custa|quanto|precinho|barato|caro|desconto|cupom)\b/i, label: 'pricing' },
      { re: /\b(pagamento|pagar|pix|boleto|cartão|cartao|crédito|débito|transferência|picpay)\b/i, label: 'payment' },
      { re: /\b(entrega|envio|frete|prazo|rastreio|recebi|chegou|chegar|código de rastreio)\b/i, label: 'shipping' },
      { re: /\b(produto|item|mercadoria|pedido|compra|order|encomenda|cesta)\b/i, label: 'product' },
      { re: /\b(conta|cadastro|login|senha|acesso|entrar|registrar|email|autenticação)\b/i, label: 'account' },
      { re: /\b(cancelar|cancelamento|reembolso|devolver|estorno|arrependimento|devolução)\b/i, label: 'cancellation_refund' },
      { re: /\b(reclamação|problema|defeito|quebrado|erro|bug|não funciona|suporte)\b/i, label: 'complaint' },
      { re: /\b(horário|funcionamento|atendimento|demora|hora|aberto|fechado|disponível)\b/i, label: 'availability' },
    ];

    for (const { re, label } of topicPatterns) {
      if (re.test(normalized)) return label;
    }

    return 'general_inquiry';
  }
}
