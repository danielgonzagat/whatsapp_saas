import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import { Request, Response } from 'express';
import type Redis from 'ioredis';
import OpenAI from 'openai';
import { createTextLlmClient, resolveTextLlmApiKey } from '../lib/llm-provider';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MindEventSpine } from './mind/coordination';
import { MindObservabilityService } from './mind/observability/mind-observability.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { UnifiedAgentService } from './unified-agent.service';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { randomIdSegment } from '../common/random-id';
import { IntentRouterService } from './intent-router/intent-router.service';
import {
  GuestConversation,
  persistConversation,
  persistConversationMessage,
  cleanupOldConversations as cleanupOldConversationsFn,
  getConversationStats,
} from './guest-chat.conversation.helpers';
import {
  buildGuestMessages,
  generateGuestReply,
  runDeterministicAction,
} from './guest-chat.chat.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { AttentionService } from './mind/attention.service';
import { ValenceAggregatorService } from './mind/valence-aggregator.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindConceptService } from './mind/memory/mind-concepts.service';
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
import { RiskClassService } from './risk-class/risk-class.service';
import { SpineEmitterService } from './spine/spine-emitter.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { buildMindSignals } from './mind/build-mind-signals.helper';
import { buildKloelMindSignalsDeps } from './kloel-reply-engine.cognitive-state.helpers';
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  closeChatReplyOutcome,
} from './kloel-reply-engine.decision-outcome.helpers';
import { applyChatTerminalHooks } from './guest-chat.terminal-hooks.helper';
// cache.invalidate — Redis is the primary guest conversation store; local Map is fallback.
@Injectable()
export class GuestChatService implements OnModuleDestroy {
  private readonly logger = StructuredLogger.from(GuestChatService.name);
  private readonly openai: OpenAI;
  private readonly unavailableMessage =
    'Eu continuo aqui, mas a camada de IA esta instavel agora. Tenta de novo em alguns segundos que eu retomo de onde paramos.';

  // Local fallback when Redis is temporarily unavailable.
  private conversations: Map<string, GuestConversation> = new Map();

  // Limpar conversas antigas a cada 1 hora
  private cleanupInterval?: NodeJS.Timeout | undefined;

  /** Stores the last built cognitive state for post-reply surprise computation (PI-K19-A). */
  private _lastCognitiveState?: Record<string, unknown>;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
    @Optional() private readonly abiBuilder?: AbiBuilderService,
    @Optional() private readonly spine?: MindEventSpine,
    @Optional() private readonly mindObservability?: MindObservabilityService,
    @Optional() private readonly unifiedAgent?: UnifiedAgentService,
    @Optional() private readonly toolDispatcher?: KloelToolDispatcherService,
    @Optional() private readonly intentRouter?: IntentRouterService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly attentionService?: AttentionService,
    @Optional() private readonly valenceAggregatorService?: ValenceAggregatorService,
    @Optional() private readonly mindBeliefService?: MindBeliefService,
    @Optional() private readonly mindConceptService?: MindConceptService,
    @Optional() private readonly selfHealthService?: SelfHealthService,
    @Optional() private readonly selfGapsService?: SelfGapsService,
    @Optional() private readonly riskClassService?: RiskClassService,
    @Optional() private readonly spineEmitter?: SpineEmitterService,
    @Optional() private readonly decisionOutcomeService?: DecisionOutcomeService,
    @Optional() private readonly mindSurpriseService?: MindSurpriseService,
  ) {
    const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    const apiKey = this.getOpenAiKey();

    if (!isTestEnv) {
      this.logger.log(
        `GuestChatService initialized. API Key present: ${!!apiKey}, length: ${apiKey?.length || 0}`,
      );
      if (!apiKey) {
        this.logger.error('Primary LLM API key not found! Check your .env file.');
      }
    }

    this.openai = createTextLlmClient(this.configService) ?? new OpenAI({ apiKey: 'missing' });

    // Limpar conversas inativas (mais de 24h)
    if (!isTestEnv) {
      this.cleanupInterval = setInterval(() => this.cleanupOldConversations(), 60 * 60 * 1000);
      this.cleanupInterval.unref?.();
    }
  }

  /** Handle file upload from chat — store file and link to product */
  async handleFileUpload(
    buffer: Buffer,
    originalname: string,
    mimetype: string,
    workspaceId: string,
    productName: string,
  ): Promise<{ url?: string; message: string }> {
    void mimetype;
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const uploadDir = path.join(process.cwd(), '..', 'uploads', workspaceId || 'guest');
      await fs.mkdir(uploadDir, { recursive: true });
      const ext = path.extname(originalname) || '.bin';
      const filename = `${Date.now().toString(36)}_${randomIdSegment(6)}${ext}`;
      const filepath = path.join(uploadDir, filename);
      await fs.writeFile(filepath, buffer);
      const url = `/uploads/${workspaceId || 'guest'}/${filename}`;

      // If productName provided, link image to product
      if (productName && this.toolDispatcher) {
        try {
          await this.toolDispatcher.executeTool(workspaceId, 'update_product', {
            productName,
            imageUrl: url,
          });
        } catch {
          /* non-blocking */
        }
      }
      return {
        url,
        message: `Arquivo ${originalname} enviado${productName ? ` e vinculado ao produto ${productName}` : ''}.`,
      };
    } catch (e: unknown) {
      return { message: `Erro: ${e instanceof Error ? e.message : 'desconhecido'}` };
    }
  }
  /** On module destroy. */
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /** Leitura unificada da chave OpenAI (process.env → ConfigService) */
  private getOpenAiKey(): string | undefined {
    return resolveTextLlmApiKey(this.configService);
  }

  private writeStreamChunk(
    res: Response,
    data: { content?: string; chunk?: string; done?: boolean; error?: string },
  ) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private async buildGuestMessages(message: string, sessionId: string) {
    return buildGuestMessages(
      message,
      sessionId,
      this.abiBuilder,
      this.redis,
      this.conversations,
      this.logger,
    );
  }

  private async generateGuestReply(
    contextMessages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[],
    sessionId: string,
  ): Promise<string> {
    return generateGuestReply(
      contextMessages,
      sessionId,
      this.openai,
      this.configService,
      this.logger,
      this.opsAlert,
      this.unavailableMessage,
    );
  }

  /** Build mindSignals for guest chat cognitive parity (PI-K19-A). */
  private async buildGuestMindSignals(
    workspaceId: string,
    userMessage: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.prisma) {
      return null;
    }

    const deps = buildKloelMindSignalsDeps(this.prisma, this.logger, {
      attentionService: this.attentionService,
      valenceAggregatorService: this.valenceAggregatorService,
      mindBeliefService: this.mindBeliefService,
      mindConceptService: this.mindConceptService,
      selfHealthService: this.selfHealthService,
      selfGapsService: this.selfGapsService,
      riskClassService: this.riskClassService,
    });

    try {
      return await buildMindSignals(deps, workspaceId, userMessage);
    } catch {
      return null;
    }
  }

  /**
   * 💬 Chat com streaming SSE para visitantes
   */
  async chat(message: string, sessionId: string, req: Request, res: Response): Promise<void> {
    // CORS manual — obrigatório porque estamos usando @Res() e streaming
    // NestJS desativa CORS automático quando usamos @Res()
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Session-Id, Accept',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Configurar SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', sessionId);

    // Enviar cabeçalhos antes de escrever dados
    res.flushHeaders();

    const startedAt = Date.now();
    const chatWsId = sessionId;
    const chatOutcomeKey = buildChatOutcomeKey(chatWsId);
    let fullResponse = '';
    try {
      if (!message || message.trim().length === 0) {
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }

      const apiKey = this.getOpenAiKey();
      if (!apiKey) {
        closeChatReplyOutcome(this.decisionOutcomeService, this.logger, {
          outcomeKey: chatOutcomeKey,
          outcomeName: 'chat.degraded.no_api_key',
          wonVsBaseline: false,
        });
        this.writeStreamChunk(res, {
          content: this.unavailableMessage,
          chunk: this.unavailableMessage,
          error: 'openai_api_key_missing',
          done: true,
        });
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }

      if (chatOutcomeKey) {
        recordChatReplyDecision(this.decisionOutcomeService, this.logger, {
          workspaceId: chatWsId,
          outcomeKey: chatOutcomeKey,
          surface: 'guest',
          messageLength: message.length,
        });
      }

      void this.spineEmitter
        ?.emit({
          eventName: 'cognition.decision_made',
          workspaceId: chatWsId,
          truthMode: 'observed',
          provenance: {
            source: 'production',
            processor: 'guest-chat',
            processorVersion: '1.0.0',
            schemaVersion: '1.0.0',
          },
          payload: { decision: 'engage', messageLength: message.length, surface: 'guest' },
        })
        .catch(() => {});

      const mindSignals = await this.buildGuestMindSignals(chatWsId, message);

      const { conversation, contextMessages } = await this.buildGuestMessages(message, sessionId);

      // Inject mindSignals into the cognitive context for the LLM
      if (mindSignals) {
        const lastMsg = contextMessages[contextMessages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          const parsed = JSON.parse(lastMsg.content) as {
            cognitiveState?: Record<string, unknown>;
            [key: string]: unknown;
          };
          parsed.cognitiveState = { ...(parsed.cognitiveState ?? {}), mindSignals };
          contextMessages[contextMessages.length - 1] = {
            ...lastMsg,
            content: JSON.stringify(parsed),
          };
        }
      }
      this._lastCognitiveState = { mindSignals };

      fullResponse = await this.generateGuestReply(contextMessages, sessionId);

      applyChatTerminalHooks(this.terminalDeps(), {
        outcomeKey: chatOutcomeKey,
        success: fullResponse.length > 0,
        workspaceId: chatWsId,
        surface: 'guest',
        startedAt,
      });

      this.writeStreamChunk(res, {
        content: fullResponse,
        chunk: fullResponse,
        done: false,
      });

      // Salvar resposta na conversa
      conversation.messages.push({ role: 'assistant', content: fullResponse });
      await this.persistConversation(sessionId, conversation);

      // Enviar done
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: unknown) {
      applyChatTerminalHooks(
        this.terminalDeps(),
        {
          outcomeKey: chatOutcomeKey,
          success: false,
          workspaceId: chatWsId,
          surface: 'guest',
          startedAt,
        },
        error,
      );
      this.logger.error(
        `Guest chat error: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.writeStreamChunk(res, {
        content: this.unavailableMessage,
        chunk: this.unavailableMessage,
        error: 'guest_chat_error',
        done: true,
      });
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
  /**
   * 🔄 Chat síncrono (sem streaming)
   */

  private resolveDefaultWorkspaceId(): string | undefined {
    if (process.env.NODE_ENV !== 'production') {
      return 'ws-test-001';
    }
    return undefined;
  }

  async chatSync(message: string, sessionId: string, workspaceId?: string): Promise<string> {
    const startedAt = Date.now();
    const effectiveWsId = workspaceId || this.resolveDefaultWorkspaceId();
    const metricWsId = effectiveWsId || sessionId;
    const chatOutcomeKey = buildChatOutcomeKey(metricWsId);

    if (chatOutcomeKey) {
      recordChatReplyDecision(this.decisionOutcomeService, this.logger, {
        workspaceId: metricWsId,
        outcomeKey: chatOutcomeKey,
        surface: 'guest',
        messageLength: message.length,
      });
    }

    void this.spineEmitter
      ?.emit({
        eventName: 'cognition.decision_made',
        workspaceId: metricWsId,
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'guest-chat',
          processorVersion: '1.0.0',
          schemaVersion: '1.0.0',
        },
        payload: { decision: 'engage', messageLength: message.length, surface: 'guest' },
      })
      .catch(() => {});

    try {
      if (!message || message.trim().length === 0) {
        return '';
      }

      const apiKey = this.getOpenAiKey();
      if (!apiKey) {
        this.logger.error('OPENAI_API_KEY not configured');
        return this.unavailableMessage;
      }

      // DETERMINISTIC ACTION ROUTER — execute tools without LLM decision
      if (effectiveWsId && this.toolDispatcher) {
        const actionReply = await runDeterministicAction(
          message,
          sessionId,
          effectiveWsId,
          this.toolDispatcher,
          this.intentRouter,
          this.spine,
          this.redis,
          this.conversations,
          this.logger,
        );
        if (actionReply !== null) {
          applyChatTerminalHooks(this.terminalDeps(), {
            outcomeKey: chatOutcomeKey,
            success: true,
            workspaceId: metricWsId,
            surface: 'guest',
            startedAt,
          });
          return actionReply;
        }
      }

      // UNIFIED AGENT PATH
      if (effectiveWsId && this.unifiedAgent) {
        this.logger.log(
          `Guest chat sync via UnifiedAgent: workspace=${effectiveWsId}, session=${sessionId}`,
        );
        try {
          const result = await this.unifiedAgent.processIncomingMessage({
            workspaceId: effectiveWsId,
            phone: sessionId,
            message,
            channel: 'web',
            executeTools: true,
          });
          const reply = result.reply || result.response || this.unavailableMessage;

          applyChatTerminalHooks(this.terminalDeps(), {
            outcomeKey: chatOutcomeKey,
            success: reply.length > 0,
            workspaceId: metricWsId,
            surface: 'guest',
            startedAt,
          });
          await this.persistConversationMessage(sessionId, 'user', message);
          await this.persistConversationMessage(sessionId, 'assistant', reply);
          this.logger.log(`UnifiedAgent reply: ${reply.substring(0, 100)}...`);
          return reply;
        } catch (uaError: unknown) {
          this.logger.warn(
            `UnifiedAgent failed (${uaError instanceof Error ? uaError.message : 'unknown'}), falling back to guest LLM`,
          );
        }
      }

      // GUEST LLM FALLBACK — original behavior without tools
      // ── Cognitive pipeline: build mindSignals + inject into LLM context (PI-K19-A) ──
      const mindSignals = await this.buildGuestMindSignals(metricWsId, message);

      const { conversation, contextMessages } = await this.buildGuestMessages(message, sessionId);

      if (mindSignals) {
        const lastMsg = contextMessages[contextMessages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          const parsed = JSON.parse(lastMsg.content) as {
            cognitiveState?: Record<string, unknown>;
            [key: string]: unknown;
          };
          parsed.cognitiveState = { ...(parsed.cognitiveState ?? {}), mindSignals };
          contextMessages[contextMessages.length - 1] = {
            ...lastMsg,
            content: JSON.stringify(parsed),
          };
        }
      }
      this._lastCognitiveState = { mindSignals };

      this.logger.log(
        `Guest chat sync: session=${sessionId}, message="${message.substring(0, 50)}..."`,
      );

      const reply = await this.generateGuestReply(contextMessages, sessionId);

      applyChatTerminalHooks(this.terminalDeps(), {
        outcomeKey: chatOutcomeKey,
        success: reply.length > 0,
        workspaceId: metricWsId,
        surface: 'guest',
        startedAt,
      });

      conversation.messages.push({ role: 'assistant', content: reply });
      await this.persistConversation(sessionId, conversation);

      this.logger.log(`Guest chat sync reply: ${reply.substring(0, 100)}...`);

      return reply;
    } catch (error: unknown) {
      applyChatTerminalHooks(
        this.terminalDeps(),
        {
          outcomeKey: chatOutcomeKey,
          success: false,
          workspaceId: metricWsId,
          surface: 'guest',
          startedAt,
        },
        error,
      );
      this.logger.error(
        `Guest chat sync error: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      return this.unavailableMessage;
    }
  }
  // ── Observability helper ──

  private terminalDeps() {
    return {
      decisionOutcomeService: this.decisionOutcomeService,
      mindBeliefService: this.mindBeliefService,
      mindSurpriseService: this.mindSurpriseService,
      mindObservability: this.mindObservability,
      logger: this.logger,
      opsAlert: this.opsAlert,
      _lastCognitiveState: this._lastCognitiveState,
    };
  }

  // ── Conversation persistence delegators ──

  private async persistConversation(
    sessionId: string,
    conversation: GuestConversation,
  ): Promise<void> {
    return persistConversation(
      sessionId,
      conversation,
      this.redis,
      this.conversations,
      this.logger,
    );
  }

  private async persistConversationMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    return persistConversationMessage(
      sessionId,
      role,
      content,
      this.redis,
      this.conversations,
      this.logger,
    );
  }

  /**
   * 🧹 Limpar conversas antigas
   */
  private cleanupOldConversations(): void {
    cleanupOldConversationsFn(this.conversations, this.logger);
  }

  /**
   * 📊 Estatísticas (para debug)
   */
  getStats(): { activeSessions: number; totalMessages: number } {
    return getConversationStats(this.conversations);
  }
}
