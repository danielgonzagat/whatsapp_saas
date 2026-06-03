/**
 * WhatsAppMindCoordinator — canonical per-channel WhatsApp cognitive
 * coordinator (ADR-0013 Wave M1).
 *
 * Per ADR-0012 OmniCore, the WhatsApp channel itself is being absorbed into
 * `marketing/channels/whatsapp/`, but the per-channel cognitive coordinator
 * stays under Mind regardless.
 *
 * Legacy alias: `WhatsAppBrainService` (export below) from
 * `backend/src/kloel/whatsapp-brain.service.ts` — kept for the 4-week alias
 * window before deletion.
 *
 * @cluster Mind/Coordination
 * @see docs/adr/0013-kloel-mind-unification.md
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable } from '@nestjs/common';
import { KloelLead } from '@prisma/client';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizePhone } from '../../../common/phone/phone-normalization.util';
import {
  includesAnyPhrase,
  normalizeIntentText,
} from '../../../marketing/channels/whatsapp/whatsapp-normalization.util';
import { DecisionOutcomeService } from '../../decision-outcome.service';
import { KloelService } from '../../kloel.service';

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

/** Per-channel WhatsApp cognitive coordinator. */
@Injectable()
export class WhatsAppMindCoordinator {
  private readonly logger = StructuredLogger.from(WhatsAppMindCoordinator.name);

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

    // PERSON migration PHASE 1 dual-write: keep Contact as the single source of
    // truth for the person behind a KloelLead. Awaited but fail-open — a Contact
    // sync failure must never break lead processing.
    await this.syncCanonicalContact(workspaceId, phone, lead);

    return { id: lead.id };
  }

  /**
   * Upsert the canonical Contact for a lead's phone so Contact stays the single
   * source of truth for the person. Idempotent (upsert on workspaceId_phone),
   * workspace-isolated, and fail-open. Mirrors the lead funnel snapshot
   * (status/stage/lastMessage/lastIntent/totalMessages) and stamps `kloelLeadId`
   * write-if-null so the first lead that produced a Contact keeps provenance
   * without ever overwriting an existing link.
   */
  private async syncCanonicalContact(
    workspaceId: string,
    phone: string,
    lead: KloelLead,
  ): Promise<void> {
    const normalizedPhone = normalizePhone(phone)?.digits;
    if (!normalizedPhone) {
      return;
    }
    try {
      const existing = await this.prisma.contact.findUnique({
        where: { workspaceId_phone: { workspaceId, phone: normalizedPhone } },
        select: { kloelLeadId: true },
      });
      const funnel = {
        leadStatus: lead.status,
        leadStage: lead.stage,
        lastMessage: lead.lastMessage,
        lastIntent: lead.lastIntent,
        totalMessages: lead.totalMessages,
      };
      await this.prisma.contact.upsert({
        where: { workspaceId_phone: { workspaceId, phone: normalizedPhone } },
        update: {
          ...funnel,
          ...(existing && existing.kloelLeadId === null ? { kloelLeadId: lead.id } : {}),
        },
        create: {
          workspaceId,
          phone: normalizedPhone,
          name: `Contato ${normalizedPhone.slice(-4)}`,
          ...funnel,
          kloelLeadId: lead.id,
        },
        select: { id: true },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Falha ao sincronizar contato canônico: ${msg}`);
    }
  }
}

/**
 * @deprecated Use {@link WhatsAppMindCoordinator}. Legacy alias kept for the
 * ADR-0013 Wave M1 4-week alias window.
 */
export { WhatsAppMindCoordinator as WhatsAppBrainService };
