import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';
import { flowQueue, autopilotQueue, voiceQueue } from '../queue/queue';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { AccountAgentService } from './account-agent.service';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { WhatsappService } from './whatsapp.service';
import { WorkerRuntimeService } from './worker-runtime.service';
import { resolveConversationOwner } from './agent-conversation-state.util';

/**
 * Tipos de provedores de mensagens
 */
export type InboundProvider = 'whatsapp-api';
export type InboundIngestMode = 'live' | 'catchup';

/**
 * Mensagem normalizada de entrada
 */
export interface InboundMessage {
  workspaceId: string;
  provider: InboundProvider;
  ingestMode?: InboundIngestMode;

  /** ID único do provedor para idempotência */
  providerMessageId: string;

  /** Telefone E164 ou apenas dígitos */
  from: string;
  to?: string;

  /** Tipo de mensagem */
  type:
    | 'text'
    | 'audio'
    | 'image'
    | 'document'
    | 'video'
    | 'sticker'
    | 'unknown';

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
 * Serviço único e centralizado para processar TODAS as mensagens de entrada
 * recebidas via WAHA.
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
  private readonly contactDebounceMs = Math.max(
    500,
    parseInt(process.env.AUTOPILOT_CONTACT_DEBOUNCE_MS || '2000', 10) || 2000,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    @InjectRedis() private readonly redis: Redis,
    private readonly accountAgent: AccountAgentService,
    private readonly workerRuntime: WorkerRuntimeService,
    private readonly unifiedAgent: UnifiedAgentService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  /**
   * Processa uma mensagem de entrada de forma unificada
   */
  async process(msg: InboundMessage): Promise<ProcessResult> {
    const startTime = Date.now();

    // 1. IDEMPOTÊNCIA (P0) - Evita processar mesma mensagem duas vezes
    const exists = await this.checkDuplicate(
      msg.workspaceId,
      msg.providerMessageId,
    );
    if (exists) {
      this.logger.debug(
        `[DEDUPE] Mensagem duplicada ignorada: ${msg.providerMessageId}`,
      );
      return { deduped: true, messageId: exists };
    }

    // 2. Normalizar telefone
    const phone = this.normalizePhone(msg.from);

    // 3. Garantir contato existe (upsert)
    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: msg.workspaceId,
          phone,
        },
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

    let savedMessage;
    try {
      savedMessage = await this.inbox.saveMessageByPhone({
        workspaceId: msg.workspaceId,
        phone,
        content: processedContent,
        direction: 'INBOUND',
        externalId: msg.providerMessageId,
        type: this.mapMessageType(msg.type),
        mediaUrl: msg.mediaUrl,
      });
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.message.findFirst({
          where: {
            workspaceId: msg.workspaceId,
            externalId: msg.providerMessageId,
          },
          select: { id: true, contactId: true },
        });

        if (existing) {
          await this.redis.set(
            `inbound:dedupe:${msg.workspaceId}:${msg.providerMessageId}`,
            existing.id,
            'EX',
            300,
          );
          return {
            deduped: true,
            messageId: existing.id,
            contactId: existing.contactId,
          };
        }
      }

      throw error;
    }

    await this.redis.set(
      `inbound:dedupe:${msg.workspaceId}:${msg.providerMessageId}`,
      savedMessage.id,
      'EX',
      300,
    );

    // 5. Entregar ao Flow Engine (Redis context store)
    await this.deliverToFlowContext(phone, processedContent, msg.workspaceId);

    // 6. Se áudio, enfileirar para transcrição via Whisper
    if (msg.type === 'audio' && msg.mediaUrl) {
      this.logger.log(
        `🎤 [TRANSCRIBE] Enfileirando áudio para transcrição: ${phone}`,
      );
      await voiceQueue.add('transcribe-audio', {
        workspaceId: msg.workspaceId,
        contactId: contact.id,
        messageId: savedMessage.id,
        phone,
        mediaUrl: msg.mediaUrl,
        mime: msg.mediaMime,
      });
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: msg.workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as any) || {};

    await this.accountAgent.detectCatalogGap({
      workspaceId: msg.workspaceId,
      contactId: contact.id,
      phone,
      conversationId: (savedMessage as any)?.conversationId || null,
      messageContent: processedContent,
    });

    // 7. Acionar Autopilot (se habilitado)
    await this.triggerAutopilot(
      msg.workspaceId,
      contact.id,
      phone,
      processedContent,
      savedMessage.id,
      settings,
      msg.ingestMode,
    );

    const duration = Date.now() - startTime;
    this.logger.log(
      `✅ [INBOUND] Processado em ${duration}ms: ${phone} via ${msg.provider}`,
    );

    return {
      deduped: false,
      messageId: savedMessage.id,
      contactId: contact.id,
    };
  }

  /**
   * Verifica se mensagem já foi processada (idempotência)
   */
  private async checkDuplicate(
    workspaceId: string,
    providerMessageId: string,
  ): Promise<string | null> {
    if (!providerMessageId) return null;

    // Primeiro, check rápido no Redis (cache/lock de 5 min)
    const cacheKey = `inbound:dedupe:${workspaceId}:${providerMessageId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached && cached !== 'processing') return cached;
    if (cached === 'processing') {
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.sleep(150);
        const refreshed = await this.redis.get(cacheKey);
        if (refreshed && refreshed !== 'processing') {
          return refreshed;
        }
      }
    }

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
      await this.redis.set(cacheKey, existing.id, 'EX', 300);
      return existing.id;
    }

    // Lock distribuído curto para reduzir race condition entre webhook/catch-up
    const locked = await this.redis.set(
      cacheKey,
      'processing',
      'EX',
      300,
      'NX',
    );
    if (locked !== 'OK') {
      return null;
    }

    return null;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Entrega mensagem ao contexto do Flow Engine via Redis
   */
  private async deliverToFlowContext(
    phone: string,
    message: string,
    workspaceId: string,
  ) {
    const normalized = this.normalizePhone(phone);
    const key = `reply:${normalized}`;

    try {
      await this.redis.rpush(key, message);
      await this.redis.expire(key, 60 * 60 * 24); // 24 hours TTL
    } catch (err: any) {
      this.logger.warn(`[CTX] Redis error: ${err?.message}`);
    }

    // Notifica worker para retomar fluxos em WAIT
    await flowQueue.add(
      'resume-flow',
      {
        user: normalized,
        message,
        workspaceId,
      },
      {
        removeOnComplete: true,
      },
    );
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
    settings?: any,
    ingestMode?: InboundIngestMode,
  ) {
    try {
      const autonomousEnabled = this.isAutonomousEnabled(
        settings,
        ingestMode,
      );
      const liveAutonomyFallback =
        !autonomousEnabled &&
        this.shouldForceLiveAutonomyFallback(settings, ingestMode);

      if (autonomousEnabled || liveAutonomyFallback) {
        if (liveAutonomyFallback) {
          this.logger.warn(
            `🤖 [AUTOPILOT] Live autonomy fallback enabled for ${phone} because the WAHA session is connected but autonomy mode is not persisted yet`,
          );
        }

        if (this.shouldUseInlineReactiveProcessing(settings, ingestMode)) {
          await this.triggerInlineAutopilot({
            workspaceId,
            contactId,
            phone,
            messageContent,
            messageId,
            source: 'waha_inline_reactive',
            reason: 'inline_reactive_primary',
            settings,
          });
          return;
        }

        const workerAvailable = await this.workerRuntime.isAvailable();

        if (!workerAvailable) {
          await this.triggerInlineAutopilot({
            workspaceId,
            contactId,
            phone,
            messageContent,
            messageId,
            source: 'waha_inline_fallback',
            reason: 'worker_unavailable',
            settings,
          });
          return;
        }

        this.logger.log(
          `🤖 [AUTOPILOT] Enfileirando análise consolidada por contato: ${phone}`,
        );

        const scanKey = `autopilot:scan-contact:${workspaceId}:${contactId}`;
        const reserved = await this.redis.set(
          scanKey,
          messageId,
          'PX',
          this.contactDebounceMs,
          'NX',
        );

        if (reserved === 'OK') {
          try {
            await autopilotQueue.add(
              'scan-contact',
              {
                workspaceId,
                contactId,
                phone,
                messageContent,
                messageId,
              },
              {
                jobId: buildQueueJobId(
                  'scan-contact',
                  workspaceId,
                  contactId,
                  messageId,
                ),
                delay: this.contactDebounceMs,
                deduplication: {
                  id: buildQueueDedupId(
                    'scan-contact',
                    workspaceId,
                    contactId,
                  ),
                  ttl: this.contactDebounceMs + 500,
                },
                removeOnComplete: true,
              },
            );
          } catch (error: any) {
            const message = String(error?.message || '');
            if (!message.includes('Job is already waiting')) {
              throw error;
            }
          }
        }
      }

      // Detecção de sinais de compra em tempo real
      const hotFlowId = settings?.autopilot?.hotFlowId;
      const lowerContent = (messageContent || '').toLowerCase();
      const buyKeywords = [
        'preco',
        'preço',
        'price',
        'quanto',
        'pix',
        'boleto',
        'garantia',
        'comprar',
        'assinar',
      ];
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

  private isAutonomousEnabled(
    settings: any,
    ingestMode?: InboundIngestMode,
  ): boolean {
    const mode = String(settings?.autonomy?.mode || '').trim().toUpperCase();

    if (mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL') {
      return true;
    }

    if (mode === 'HUMAN_ONLY' || mode === 'SUSPENDED') {
      return false;
    }

    if (mode === 'OFF') {
      return settings?.autopilot?.enabled === true;
    }

    if (mode) {
      return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
    }

    if (
      ingestMode === 'live' &&
      this.shouldForceLiveAutonomyFallback(settings, ingestMode)
    ) {
      return true;
    }

    return settings?.autopilot?.enabled === true;
  }

  private shouldUseInlineReactiveProcessing(
    settings: any,
    ingestMode?: InboundIngestMode,
  ): boolean {
    if (ingestMode !== 'live') {
      return false;
    }

    const override = String(process.env.AUTOPILOT_INLINE_REACTIVE || 'true')
      .trim()
      .toLowerCase();

    if (['false', '0', 'off', 'no'].includes(override)) {
      return false;
    }

    if (['true', '1', 'on', 'yes'].includes(override)) {
      return true;
    }

    return settings?.autopilot?.enabled === true;
  }

  private async triggerInlineAutopilot(input: {
    workspaceId: string;
    contactId: string;
    phone: string;
    messageContent: string;
    messageId: string;
    source: string;
    reason: 'inline_reactive_primary' | 'worker_unavailable';
    settings?: any;
  }) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { contactId: input.contactId },
          { contact: { phone: input.phone } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        mode: true,
        status: true,
        assignedAgentId: true,
      },
    });

    const owner = resolveConversationOwner(conversation);
    const bypassHumanLock = this.shouldBypassHumanLock(input.settings);

    if (conversation && owner !== 'AGENT' && !bypassHumanLock) {
      await this.recordAutopilotSkip(
        input.workspaceId,
        input.contactId,
        'human_mode_lock',
        {
          conversationId: conversation.id,
          mode: conversation.mode || null,
          status: conversation.status || null,
          assignedAgentId: conversation.assignedAgentId || null,
        },
      );
      this.logger.log(
        `🤖 [AUTOPILOT] Inline fallback skipped for ${input.phone} because the conversation is in human mode (mode=${conversation.mode || 'null'}, assignedAgentId=${conversation.assignedAgentId || 'null'})`,
      );
      return;
    }

    if (conversation && owner !== 'AGENT' && bypassHumanLock) {
      this.logger.warn(
        `🤖 [AUTOPILOT] Bypassing human mode lock for ${input.phone} because autonomy is FULL`,
      );
    }

    const inlineKey = `autopilot:inline:${input.workspaceId}:${input.contactId}`;
    const reserved = await this.redis.set(
      inlineKey,
      input.messageId,
      'PX',
      Math.max(5000, this.contactDebounceMs + 3000),
      'NX',
    );

    if (reserved !== 'OK') {
      return;
    }

    if (input.reason === 'inline_reactive_primary') {
      this.logger.log(
        `🤖 [AUTOPILOT] Executando resposta inline reativa para ${input.phone}`,
      );
    } else {
      this.logger.warn(
        `🤖 [AUTOPILOT] Worker indisponível; executando resposta inline para ${input.phone}`,
      );
    }

    const result = await this.unifiedAgent.processIncomingMessage({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
      message: input.messageContent,
      channel: 'whatsapp',
      context: {
        source: input.source,
        deliveryMode: 'reactive',
        messageId: input.messageId,
        forceDirect: true,
      },
    });

    if (this.hasOutboundAction(result.actions || [])) {
      return;
    }

    const reply = String(result.reply || result.response || '').trim();
    if (!reply) {
      return;
    }

    await this.whatsappService.sendMessage(
      input.workspaceId,
      input.phone,
      reply,
      {
        externalId: `inline:${input.messageId}`,
        complianceMode: 'reactive',
        forceDirect: true,
      },
    );
  }

  private hasOutboundAction(
    actions: Array<{ tool?: string; result?: Record<string, any> }> = [],
  ): boolean {
    const outboundTools = new Set([
      'send_message',
      'send_product_info',
      'create_payment_link',
      'send_media',
      'send_document',
      'send_voice_note',
      'send_audio',
    ]);

    return actions.some((action) => {
      if (!outboundTools.has(String(action?.tool || ''))) {
        return false;
      }

      return (
        action?.result?.sent === true ||
        action?.result?.success === true ||
        action?.result?.messageId
      );
    });
  }

  private shouldBypassHumanLock(settings?: any): boolean {
    const override = String(process.env.AUTOPILOT_BYPASS_HUMAN_LOCK || '')
      .trim()
      .toLowerCase();

    if (['true', '1', 'on', 'yes'].includes(override)) {
      return true;
    }

    if (['false', '0', 'off', 'no'].includes(override)) {
      return false;
    }

    return String(settings?.autonomy?.mode || '').trim().toUpperCase() === 'FULL';
  }

  private shouldForceLiveAutonomyFallback(
    settings: any,
    ingestMode?: InboundIngestMode,
  ): boolean {
    if (ingestMode !== 'live') {
      return false;
    }

    const mode = String(settings?.autonomy?.mode || '').trim().toUpperCase();
    if (mode) {
      return false;
    }

    if (settings?.autopilot?.enabled === false) {
      return false;
    }

    const provider = String(settings?.whatsappProvider || '')
      .trim()
      .toLowerCase();
    const sessionStatus = String(
      settings?.whatsappApiSession?.status || settings?.connectionStatus || '',
    )
      .trim()
      .toLowerCase();
    const runtimeState = String(settings?.ciaRuntime?.state || '')
      .trim()
      .toUpperCase();

    const wahaWorkspace =
      provider === 'whatsapp-api' || Boolean(settings?.whatsappApiSession);
    const connectedSession =
      sessionStatus === 'connected' ||
      runtimeState === 'LIVE_READY' ||
      runtimeState === 'LIVE_AUTONOMY' ||
      runtimeState === 'EXECUTING_IMMEDIATELY' ||
      runtimeState === 'EXECUTING_BACKLOG';

    return wahaWorkspace && connectedSession;
  }

  private async recordAutopilotSkip(
    workspaceId: string,
    contactId: string,
    reason: string,
    meta?: Record<string, any>,
  ) {
    try {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'INLINE_AUTOPILOT',
          action: 'SKIP_INLINE_REPLY',
          status: 'skipped',
          reason,
          meta,
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `[AUTOPILOT] Falha ao registrar skip inline: ${error?.message || 'unknown_error'}`,
      );
    }
  }

  /**
   * Normaliza telefone para formato consistente
   */
  private normalizePhone(phone: string): string {
    return phone
      .replace(/\D/g, '')
      .replace('@c.us', '')
      .replace('@s.whatsapp.net', '');
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
