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
  createdAt?: Date | string | null;

  /** ID único do provedor para idempotência */
  providerMessageId: string;

  /** Telefone E164 ou apenas dígitos */
  from: string;
  to?: string;
  senderName?: string;

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
  private readonly sharedReplyLockMs = Math.max(
    10_000,
    parseInt(process.env.AUTOPILOT_SHARED_REPLY_LOCK_MS || '45000', 10) ||
      45_000,
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
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: msg.workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as any) || {};
    const workspaceSelfPhone = this.normalizePhone(
      String(settings?.whatsappApiSession?.phoneNumber || ''),
    );
    if (workspaceSelfPhone && workspaceSelfPhone === phone) {
      this.logger.warn(
        `[SELF_CONTACT] Ignorando mensagem do próprio número da sessão: ${phone}`,
      );
      return { deduped: true };
    }

    // 3. Garantir contato existe (upsert)
    const contact = await this.prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: msg.workspaceId,
          phone,
        },
      },
      update: msg.senderName
        ? {
            name: msg.senderName,
          }
        : {},
      create: {
        workspaceId: msg.workspaceId,
        phone,
        name: msg.senderName || phone,
      },
      select: { id: true },
    });

    const remoteContactName = String(msg.senderName || '').trim() || phone;
    await this.whatsappService
      .syncRemoteContactProfile(msg.workspaceId, phone, remoteContactName)
      .catch(() => undefined);

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
        createdAt: msg.createdAt,
        countAsUnread: msg.ingestMode !== 'catchup',
        silent: msg.ingestMode === 'catchup',
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
    const isCatchup = msg.ingestMode === 'catchup';

    // 5. Entregar ao Flow Engine (Redis context store)
    if (!isCatchup) {
      await this.deliverToFlowContext(phone, processedContent, msg.workspaceId);
    }

    // 6. Se áudio, enfileirar para transcrição via Whisper
    if (!isCatchup && msg.type === 'audio' && msg.mediaUrl) {
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
      msg.providerMessageId,
      settings,
      msg.ingestMode,
    );

    const duration = Date.now() - startTime;
    if (isCatchup) {
      this.logger.log(
        `✅ [INBOUND:CATCHUP] Persistido e encaminhado em ${duration}ms: ${phone} via ${msg.provider}`,
      );
    } else {
      this.logger.log(
        `✅ [INBOUND] Processado em ${duration}ms: ${phone} via ${msg.provider}`,
      );
    }

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
    providerMessageId: string,
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
            providerMessageId,
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
            providerMessageId,
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
                providerMessageId,
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
    providerMessageId: string;
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
        lastMessageAt: true,
        messages: {
          take: 3,
          orderBy: { createdAt: 'desc' },
          select: {
            direction: true,
            createdAt: true,
          },
        },
      },
    });

    const owner = resolveConversationOwner(conversation);
    const bypassHumanLock = this.shouldBypassHumanLock(input.settings);
    const reclaimHumanLock = this.shouldAutoReclaimHumanLock(
      input.settings,
      conversation,
    );

    if (conversation && owner !== 'AGENT' && reclaimHumanLock) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { mode: 'AI', assignedAgentId: null },
      });
      await this.recordAutopilotSkip(
        input.workspaceId,
        input.contactId,
        'human_lock_auto_reclaimed',
        {
          conversationId: conversation.id,
          previousMode: conversation.mode || null,
          previousAssignedAgentId: conversation.assignedAgentId || null,
        },
      );
      this.logger.warn(
        `🤖 [AUTOPILOT] Reclaiming conversation ${conversation.id} for ${input.phone} because the latest turn is still waiting for an agent reply`,
      );
    }

    if (
      conversation &&
      owner !== 'AGENT' &&
      !bypassHumanLock &&
      !reclaimHumanLock
    ) {
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

    const replyLockKey = this.getSharedReplyLockKey(
      input.workspaceId,
      input.contactId,
      input.phone,
    );
    const replyReserved = await this.redis.set(
      replyLockKey,
      input.messageId,
      'PX',
      this.sharedReplyLockMs,
      'NX',
    );
    if (replyReserved !== 'OK') {
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

    let result:
      | Awaited<ReturnType<UnifiedAgentService['processIncomingMessage']>>
      | null = null;
    let keepReplyLock = false;
    await this.sleep(this.contactDebounceMs);

    const pendingBatch = await this.buildPendingInboundBatch({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
      fallbackMessageContent: input.messageContent,
      fallbackProviderMessageId: input.providerMessageId,
    });

    const aggregatedMessage =
      pendingBatch?.aggregatedMessage || input.messageContent;
    const latestQuotedMessageId =
      pendingBatch?.latestQuotedMessageId || input.providerMessageId;

    try {
      result = await this.unifiedAgent.processIncomingMessage({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        phone: input.phone,
        message: aggregatedMessage,
        channel: 'whatsapp',
        context: {
          source: input.source,
          deliveryMode: 'reactive',
          messageId: input.messageId,
          providerMessageId: latestQuotedMessageId,
          pendingQuotedMessageIds: pendingBatch?.messages.map(
            (message) => message.quotedMessageId,
          ),
          pendingMessageCount: pendingBatch?.messages.length || 1,
          forceDirect: true,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `🤖 [AUTOPILOT] Inline agent failed for ${input.phone}: ${error?.message || 'unknown_error'}`,
      );
    }

    if (this.hasOutboundAction(result?.actions || [])) {
      keepReplyLock = true;
      return;
    }

    const reply = String(
      result?.reply ||
        result?.response ||
        this.buildInlineFallbackReply(aggregatedMessage),
    ).trim();
    if (!reply) {
      return;
    }

    try {
      const replyPlan = await this.unifiedAgent.buildQuotedReplyPlan({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        phone: input.phone,
        draftReply: reply,
        customerMessages:
          pendingBatch?.messages || [
            {
              content: input.messageContent,
              quotedMessageId: latestQuotedMessageId,
            },
          ],
      });

      for (let index = 0; index < replyPlan.length; index += 1) {
        const plan = replyPlan[index];
        const sendResult = await this.whatsappService.sendMessage(
          input.workspaceId,
          input.phone,
          plan.text,
          {
            externalId: `inline:${input.messageId}:${index + 1}`,
            complianceMode: 'reactive',
            forceDirect: true,
            quotedMessageId: plan.quotedMessageId || latestQuotedMessageId,
          },
        );

        if (sendResult?.error) {
          this.logger.error(
            `🤖 [AUTOPILOT] Inline reply send failed for ${input.phone}: ${sendResult.message || 'send_failed'}`,
          );
          return;
        }
      }

      keepReplyLock = true;
    } finally {
      if (!keepReplyLock) {
        await this.releaseSharedReplyLock(replyLockKey);
      }
    }
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

  private async buildPendingInboundBatch(params: {
    workspaceId: string;
    contactId: string;
    phone: string;
    fallbackMessageContent: string;
    fallbackProviderMessageId: string;
  }): Promise<{
    aggregatedMessage: string;
    latestQuotedMessageId: string;
    messages: Array<{ content: string; quotedMessageId: string }>;
  } | null> {
    const lastOutbound = await this.prisma.message.findFirst({
      where: {
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const pendingMessages = await this.prisma.message.findMany({
      where: {
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        direction: 'INBOUND',
        ...(lastOutbound?.createdAt
          ? {
              createdAt: {
                gt: lastOutbound.createdAt,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: {
        content: true,
        externalId: true,
      },
    });

    const usableMessages = pendingMessages
      .map((message) => ({
        content: String(message.content || '').trim(),
        quotedMessageId: String(message.externalId || '').trim(),
      }))
      .filter((message) => message.content && message.quotedMessageId);

    const fallbackMessage = {
      content: String(params.fallbackMessageContent || '').trim(),
      quotedMessageId: String(params.fallbackProviderMessageId || '').trim(),
    };
    const messages = usableMessages.length
      ? usableMessages
      : fallbackMessage.content && fallbackMessage.quotedMessageId
        ? [fallbackMessage]
        : [];

    if (!messages.length) {
      return null;
    }

    const aggregatedMessage =
      messages.length === 1
        ? messages[0].content
        : messages
            .map(
              (message, index) =>
                `[${index + 1}] ${String(message.content || '').trim()}`,
            )
            .join('\n');

    return {
      aggregatedMessage,
      latestQuotedMessageId:
        messages[messages.length - 1]?.quotedMessageId ||
        params.fallbackProviderMessageId,
      messages,
    };
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

  private shouldAutoReclaimHumanLock(
    settings: any,
    conversation?: {
      mode?: string | null;
      status?: string | null;
      assignedAgentId?: string | null;
      messages?: Array<{ direction?: string | null; createdAt?: Date | string | null }>;
    } | null,
  ): boolean {
    const override = String(
      process.env.AUTOPILOT_RECLAIM_HUMAN_LOCK_ON_INBOUND || 'true',
    )
      .trim()
      .toLowerCase();

    if (['false', '0', 'off', 'no'].includes(override)) {
      return false;
    }

    const autonomyMode = String(settings?.autonomy?.mode || '')
      .trim()
      .toUpperCase();
    if (autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED') {
      return false;
    }

    const conversationMode = String(conversation?.mode || '')
      .trim()
      .toUpperCase();
    if (!conversation || conversationMode === 'PAUSED') {
      return false;
    }

    const latestMessage = (conversation.messages || [])[0];
    const latestDirection = String(latestMessage?.direction || '')
      .trim()
      .toUpperCase();

    if (latestDirection !== 'INBOUND') {
      return false;
    }

    return conversationMode === 'HUMAN' || Boolean(conversation.assignedAgentId);
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

  private buildInlineFallbackReply(messageContent: string): string {
    const normalized = String(messageContent || '').trim().toLowerCase();
    const topic = this.extractFallbackTopic(messageContent);

    if (
      /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i.test(
        normalized,
      )
    ) {
      return topic
        ? `Boa, você foi direto ao ponto. Posso confirmar preço, pagamento e disponibilidade de ${topic}. Quer que eu siga por aí?`
        : 'Boa, sem rodeio fica melhor. Posso confirmar preço, pagamento e disponibilidade. Me diz o produto ou procedimento.';
    }

    if (/(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i.test(normalized)) {
      return 'Perfeito, organização ainda existe. Me diz o dia ou horário e eu organizo isso com você.';
    }

    if (/(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i.test(normalized)) {
      return 'Oi. Vamos pular a cerimônia: me diz o produto ou a dúvida e eu sigo com você.';
    }

    return topic
      ? `Entendi. Você falou de ${topic}. Me diz o que quer confirmar e eu te respondo sem enrolação.`
      : 'Entendi. Me diz o produto, exame ou objetivo e eu sigo com a informação certa, sem teatro.';
  }

  private extractFallbackTopic(messageContent: string): string | null {
    const normalized = String(messageContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) {
      return null;
    }

    const explicit =
      normalized.match(
        /\b(?:sobre|do|da|de|para)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s/-]{2,40})/i,
      )?.[1] || '';
    const candidate = explicit || normalized;
    const compact = candidate
      .replace(/[?!.;,]+$/g, '')
      .split(/\s+/)
      .slice(0, explicit ? 6 : 8)
      .join(' ')
      .trim();

    if (!compact) {
      return null;
    }

    return compact;
  }

  private getSharedReplyLockKey(
    workspaceId: string,
    contactId?: string | null,
    phone?: string | null,
  ): string {
    return `autopilot:reply:${workspaceId}:${contactId || this.normalizePhone(String(phone || ''))}`;
  }

  private async releaseSharedReplyLock(key: string) {
    try {
      await this.redis.del(key);
    } catch {
      // best effort only
    }
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
