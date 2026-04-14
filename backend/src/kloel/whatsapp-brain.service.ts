import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { includesAnyPhrase, normalizeIntentText } from '../whatsapp/whatsapp-normalization.util';
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

@Injectable()
export class WhatsAppBrainService {
  private readonly logger = new Logger(WhatsAppBrainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kloelService: KloelService,
  ) {}

  async processWebhook(payload: any, workspaceId: string): Promise<void> {
    this.logger.log('Processando webhook WhatsApp');

    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.[0]) {
      return;
    }

    const message = value.messages[0];

    const webhookMessage: WebhookMessage = {
      from: message.from,
      to: value.metadata?.display_phone_number || 'unknown',
      message: message.text?.body || '',
      messageType: message.type,
      timestamp: new Date(Number.parseInt(message.timestamp) * 1000),
      messageId: message.id,
      workspaceId,
    };

    await this.handleIncomingMessage(webhookMessage);
  }

  async handleIncomingMessage(msg: WebhookMessage): Promise<string> {
    this.logger.log(`Mensagem de ${msg.from}: ${msg.message.substring(0, 50)}...`);

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
