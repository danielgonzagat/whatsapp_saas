import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';
import { flowQueue, autopilotQueue, voiceQueue } from '../queue/queue';

/**
 * Tipos de provedores de mensagens
 */
export type InboundProvider = 'wppconnect' | 'cloud' | 'evolution' | 'baileys' | 'custom';

/**
 * Mensagem normalizada de entrada
 */
export interface InboundMessage {
  workspaceId: string;
  provider: InboundProvider;
  
  /** ID único do provedor para idempotência */
  providerMessageId: string;
  
  /** Telefone E164 ou apenas dígitos */
  from: string;
  to?: string;
  
  /** Tipo de mensagem */
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'unknown';
  
  /** Conteúdo textual */
  text?: string;
  
  /** URL da mídia (se aplicável) */
  mediaUrl?: string;
  mediaMime?: string;
  
  /** Payload original do provedor */
  raw?: any;
}

/**
 * Resultado do processamento
 */
export interface ProcessResult {
  deduped: boolean;
  messageId?: string;
  contactId?: string;
}

/**
 * 🔥 INBOUND PROCESSOR SERVICE (P0)
 * 
 * Serviço único e centralizado para processar TODAS as mensagens de entrada,
 * independente do provedor (WPPConnect, Cloud API, Evolution, etc.)
 * 
 * Responsabilidades:
 * 1. Idempotência via providerMessageId
 * 2. Upsert de contato
 * 3. Persistência da mensagem
 * 4. Entrega ao Flow Engine
 * 5. Transcrição de áudio (se aplicável)
 * 6. Acionamento do Autopilot
 */
@Injectable()
export class InboundProcessorService {
  private readonly logger = new Logger(InboundProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Processa uma mensagem de entrada de forma unificada
   */
  async process(msg: InboundMessage): Promise<ProcessResult> {
    const startTime = Date.now();
    
    // 1. IDEMPOTÊNCIA (P0) - Evita processar mesma mensagem duas vezes
    const exists = await this.checkDuplicate(msg.workspaceId, msg.providerMessageId);
    if (exists) {
      this.logger.debug(`[DEDUPE] Mensagem duplicada ignorada: ${msg.providerMessageId}`);
      return { deduped: true, messageId: exists };
    }

    // 2. Normalizar telefone
    const phone = this.normalizePhone(msg.from);
    
    // 3. Garantir contato existe (upsert)
    const contact = await this.prisma.contact.upsert({
      where: { 
        workspaceId_phone: { 
          workspaceId: msg.workspaceId, 
          phone 
        } 
      },
      update: {},
      create: { 
        workspaceId: msg.workspaceId, 
        phone,
        name: phone, // Default: phone as name
      },
      select: { id: true },
    });

    // 4. Persistir mensagem via InboxService (já inclui WebSocket, webhook dispatch)
    const processedContent = msg.text || this.getDefaultContent(msg.type);
    
    const savedMessage = await this.inbox.saveMessageByPhone({
      workspaceId: msg.workspaceId,
      phone,
      content: processedContent,
      direction: 'INBOUND',
      externalId: msg.providerMessageId,
      type: this.mapMessageType(msg.type),
      mediaUrl: msg.mediaUrl,
    });

    // 5. Entregar ao Flow Engine (Redis context store)
    await this.deliverToFlowContext(phone, processedContent, msg.workspaceId);

    // 6. Se áudio, enfileirar para transcrição via Whisper
    if (msg.type === 'audio' && msg.mediaUrl) {
      this.logger.log(`🎤 [TRANSCRIBE] Enfileirando áudio para transcrição: ${phone}`);
      await voiceQueue.add('transcribe-audio', {
        workspaceId: msg.workspaceId,
        contactId: contact.id,
        messageId: savedMessage.id,
        phone,
        mediaUrl: msg.mediaUrl,
        mime: msg.mediaMime,
      });
    }

    // 7. Acionar Autopilot (se habilitado)
    await this.triggerAutopilot(msg.workspaceId, contact.id, phone, processedContent, savedMessage.id);

    const duration = Date.now() - startTime;
    this.logger.log(`✅ [INBOUND] Processado em ${duration}ms: ${phone} via ${msg.provider}`);

    return { 
      deduped: false, 
      messageId: savedMessage.id,
      contactId: contact.id,
    };
  }

  /**
   * Verifica se mensagem já foi processada (idempotência)
   */
  private async checkDuplicate(workspaceId: string, providerMessageId: string): Promise<string | null> {
    if (!providerMessageId) return null;

    // Primeiro, check rápido no Redis (cache de 5 min)
    const cacheKey = `inbound:dedupe:${workspaceId}:${providerMessageId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    // Segundo, check no banco (fallback para casos onde Redis reiniciou)
    const existing = await this.prisma.message.findFirst({
      where: {
        workspaceId,
        externalId: providerMessageId,
      },
      select: { id: true },
    });

    if (existing) {
      // Cachear resultado para evitar queries repetidas
      await this.redis.setex(cacheKey, 300, existing.id);
      return existing.id;
    }

    // Marcar no Redis que estamos processando (evita race condition)
    await this.redis.setex(cacheKey, 300, 'processing');
    
    return null;
  }

  /**
   * Entrega mensagem ao contexto do Flow Engine via Redis
   */
  private async deliverToFlowContext(phone: string, message: string, workspaceId: string) {
    const normalized = this.normalizePhone(phone);
    const key = `reply:${normalized}`;
    
    try {
      await this.redis.rpush(key, message);
      await this.redis.expire(key, 60 * 60 * 24); // 24 hours TTL
    } catch (err: any) {
      this.logger.warn(`[CTX] Redis error: ${err?.message}`);
    }

    // Notifica worker para retomar fluxos em WAIT
    await flowQueue.add('resume-flow', { 
      user: normalized, 
      message, 
      workspaceId 
    }, { 
      removeOnComplete: true 
    });
  }

  /**
   * Aciona Autopilot se habilitado
   */
  private async triggerAutopilot(
    workspaceId: string, 
    contactId: string, 
    phone: string, 
    messageContent: string,
    messageId: string,
  ) {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });

      const settings = workspace?.providerSettings as any;
      const autopilotEnabled = settings?.autopilot?.enabled;

      if (autopilotEnabled) {
        this.logger.log(`🤖 [AUTOPILOT] Enfileirando para análise: ${phone}`);
        await autopilotQueue.add('scan-message', {
          workspaceId,
          contactId,
          phone,
          messageContent,
          messageId,
        });
      }

      // Detecção de sinais de compra em tempo real
      const hotFlowId = settings?.autopilot?.hotFlowId;
      const lowerContent = (messageContent || '').toLowerCase();
      const buyKeywords = ['preco', 'preço', 'price', 'quanto', 'pix', 'boleto', 'garantia', 'comprar', 'assinar'];
      const hasBuyingSignal = buyKeywords.some((k) => lowerContent.includes(k));
      
      if (hotFlowId && hasBuyingSignal) {
        this.logger.log(`🔥 [HOT_SIGNAL] Sinal de compra detectado: ${phone}`);
        await flowQueue.add('run-flow', {
          workspaceId,
          flowId: hotFlowId,
          user: phone,
          initialVars: { source: 'hot_signal', lastMessage: messageContent },
        });
      }

    } catch (err: any) {
      this.logger.warn(`[AUTOPILOT] Erro ao enfileirar: ${err?.message}`);
    }
  }

  /**
   * Normaliza telefone para formato consistente
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').replace('@c.us', '').replace('@s.whatsapp.net', '');
  }

  /**
   * Mapeia tipo de mensagem para o enum do banco
   */
  private mapMessageType(type: InboundMessage['type']): string {
    const typeMap: Record<string, string> = {
      text: 'TEXT',
      audio: 'AUDIO',
      image: 'IMAGE',
      video: 'VIDEO',
      document: 'DOCUMENT',
      sticker: 'STICKER',
      unknown: 'TEXT',
    };
    return typeMap[type] || 'TEXT';
  }

  /**
   * Retorna conteúdo padrão baseado no tipo
   */
  private getDefaultContent(type: InboundMessage['type']): string {
    const contentMap: Record<string, string> = {
      audio: '[Áudio recebido - transcrição pendente]',
      image: '[Imagem recebida]',
      video: '[Vídeo recebido]',
      document: '[Documento recebido]',
      sticker: '[Sticker recebido]',
      unknown: '[Mídia recebida]',
    };
    return contentMap[type] || '';
  }
}
