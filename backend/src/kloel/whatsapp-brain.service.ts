/**
 * @deprecated Use {@link ./mind/coordination/whatsapp-mind-coordinator.service.ts WhatsAppMindCoordinator}.
 * ADR-0013 Wave M1 alias window (4 weeks). Also: per ADR-0012 OmniCore,
 * the WhatsApp channel is being absorbed into marketing/channels/whatsapp/;
 * the per-channel cognitive coordinator stays under Mind regardless.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/whatsapp-mind-coordinator.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { includesAnyPhrase, normalizeIntentText } from '../whatsapp/whatsapp-normalization.util';
import { DecisionOutcomeService } from './decision-outcome.service';
import { KloelService } from './kloel.service';

interface WebhookMessage {
  from: string;
  to: string;
  message: string;
  messageType: 'text' | 'image' | 'audio' | 'document' | 'location';
  timestamp: Date;
  messageId: string;
  workspaceId: string;
}

interface IntentDetection {
  intent: 'purchase' | 'interest' | 'support' | 'return' | 'status' | 'general';
  confidence: number;
  entities: Record<string, unknown>;
}

/** Whats app brain service. */
@Injectable()
export class WhatsAppBrainService {
  private readonly logger = StructuredLogger.from(WhatsAppBrainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kloelService: KloelService,
    private readonly decisionOutcome: DecisionOutcomeService,
  ) {}

  /** Process webhook. */
  async processWebhook(payload: Record<string, unknown>, workspaceId: string): Promise<void> {
    this.logger.log('Processando webhook WhatsApp');

    const entry = (payload.entry as unknown[] | undefined)?.[0];
    if (!entry) {
      return;
    }
    const changes = (entry as Record<string, unknown>).changes as unknown[] | undefined;
    if (!changes?.[0]) {
      return;
    }
    const value = changes[0] as Record<string, unknown> | undefined;
    if (!value) {
      return;
    }

    const messages = value.messages as unknown[] | undefined;
    if (!messages?.[0]) {
      return;
    }
    const message = messages[0] as Record<string, unknown>;
    const metadata =
      value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : {};
    const textPayload =
      message.text && typeof message.text === 'object' && !Array.isArray(message.text)
        ? (message.text as Record<string, unknown>)
        : {};
    const messageType = this.normalizeMessageType(message.type);
    const timestamp =
      typeof message.timestamp === 'string' || typeof message.timestamp === 'number'
        ? Number.parseInt(String(message.timestamp), 10)
        : 0;

    const webhookMessage: WebhookMessage = {
      from: typeof message.from === 'string' ? message.from : 'unknown',
      to:
        typeof metadata.display_phone_number === 'string'
          ? metadata.display_phone_number
          : 'unknown',
      message: typeof textPayload.body === 'string' ? textPayload.body : '',
      messageType,
      timestamp: new Date((Number.isFinite(timestamp) ? timestamp : 0) * 1000),
      messageId: typeof message.id === 'string' ? message.id : 'unknown',
      workspaceId,
    };

    await this.handleIncomingMessage(webhookMessage);
  }

  private normalizeMessageType(value: unknown): WebhookMessage['messageType'] {
    if (
      value === 'text' ||
      value === 'image' ||
      value === 'audio' ||
      value === 'document' ||
      value === 'location'
    ) {
      return value;
    }
    return 'text';
  }

  /** Handle incoming message. */
  async handleIncomingMessage(msg: WebhookMessage): Promise<string> {
    this.logger.log(`Mensagem de ${msg.from}: ${msg.message.substring(0, 50)}...`);

    void this.decisionOutcome.recordEvent({
      workspaceId: msg.workspaceId,
      eventType: 'inbound.received',
      eventKey: msg.messageId,
      correlation: {
        contactId: msg.from,
        channel: 'whatsapp',
      },
    });

    const lead = await this.getOrCreateLead(msg.workspaceId, msg.from);
    const intent = this.detectIntent(msg.message);

    // Adicionar contexto do lead na mensagem para a KLOEL
    const enrichedMessage = `[Lead ID: ${lead.id}] [Telefone: ${msg.from}] [Intenção detectada: ${intent.intent}]

Mensagem do cliente: ${msg.message}`;

    const result = await this.kloelService.thinkSync({
      message: enrichedMessage,
      workspaceId: msg.workspaceId,
      mode: 'sales',
    });

    this.logger.log(`Resposta KLOEL: ${result.response.substring(0, 100)}...`);
    return result.response;
  }

  private detectIntent(message: string): IntentDetection {
    const normalized = normalizeIntentText(message);

    if (includesAnyPhrase(normalized, ['quero comprar', 'vou pagar', 'link pix', 'pagar pix'])) {
      return { intent: 'purchase', confidence: 0.9, entities: {} };
    }
    if (includesAnyPhrase(normalized, ['quanto custa', 'preco', 'valor'])) {
      return { intent: 'interest', confidence: 0.8, entities: {} };
    }
    if (includesAnyPhrase(normalized, ['problema', 'nao funciona', 'ajuda', 'erro', 'bug'])) {
      return { intent: 'support', confidence: 0.85, entities: {} };
    }
    if (includesAnyPhrase(normalized, ['devolv', 'reembolso', 'cancelar'])) {
      return { intent: 'return', confidence: 0.9, entities: {} };
    }
    if (includesAnyPhrase(normalized, ['status', 'pedido', 'entrega', 'chegou'])) {
      return { intent: 'status', confidence: 0.8, entities: {} };
    }

    return { intent: 'general', confidence: 0.5, entities: {} };
  }

  private async getOrCreateLead(workspaceId: string, phone: string): Promise<{ id: string }> {
    let lead = await this.prisma.kloelLead.findFirst({
      where: { workspaceId, phone },
    });

    if (!lead) {
      lead = await this.prisma.kloelLead.create({
        data: {
          workspaceId,
          phone,
          status: 'new',
          metadata: { source: 'whatsapp' },
        },
      });
      this.logger.log(`Novo lead criado: ${lead.id}`);
    }

    return { id: lead.id };
  }
}
