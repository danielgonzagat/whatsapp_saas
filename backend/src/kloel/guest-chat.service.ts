import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import { Request, Response } from 'express';
import type Redis from 'ioredis';
import OpenAI from 'openai';
import { createTextLlmClient } from '../lib/llm-provider';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MindEventSpine } from './mind/coordination';
import { MindObservabilityService } from './mind/observability/mind-observability.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { UnifiedAgentService } from './unified-agent.service';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { IntentRouterService } from './intent-router/intent-router.service';
import {
  GuestConversation,
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
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  closeChatReplyOutcome,
  predictChatReply,
} from './kloel-reply-engine.decision-outcome.helpers';
import { applyChatTerminalHooks } from './guest-chat.terminal-hooks.helper';
import { handleGuestFileUpload } from './guest-chat.file-upload.helpers';
import { buildGuestMindSignals as buildGuestMindSignalsFn } from './guest-chat.mind-signals.helpers';
import {
  buildTerminalDeps,
  persistGuestConversation,
  persistGuestConversationMessage,
} from './guest-chat.persistence.helpers';
import {
  onModuleDestroyLifecycle,
  getOpenAiKey as getOpenAiKeyFn,
  writeStreamChunk as writeStreamChunkFn,
} from './guest-chat.lifecycle.helpers';
import { resolveDefaultWorkspaceId as resolveDefaultWorkspaceIdFn } from './guest-chat.default-workspace.helpers';
import {
  configureGuestSseResponse,
  emitGuestEngageDecision,
  injectGuestMindSignals,
} from './guest-chat.sse.helpers';
import { MindPredictorService } from './mind/inference/mind-predictor.service';

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
    @Optional() private readonly mindPredictorService?: MindPredictorService,
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
      // Deterministic-router invariant: the streaming chat path MUST classify
      // intent BEFORE the LLM. IntentRouterService is provided via
      // IntentRouterModule (kloel.module.ts). It stays an @Optional DI param so
      // unit tests can construct this service in isolation, but in a real boot
      // its absence means deterministic routing is silently disabled — which is
      // the exact anti-pattern this slice forbids. Fail fast at boot instead.
      if (!this.intentRouter) {
        throw new Error(
          'IntentRouterService is required for deterministic routing on the streaming chat path. ' +
            'Ensure IntentRouterModule is imported in KloelModule.',
        );
      }
    }

    this.openai = createTextLlmClient(this.configService) ?? new OpenAI({ apiKey: 'missing' });

    // Limpar conversas inativas (mais de 24h)
    if (!isTestEnv) {
      this.cleanupInterval = setInterval(
        () => cleanupOldConversationsFn(this.conversations, this.logger),
        60 * 60 * 1000,
      );
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
    return handleGuestFileUpload(
      buffer,
      originalname,
      mimetype,
      workspaceId,
      productName,
      this.toolDispatcher,
    );
  }
  /** On module destroy. */
  onModuleDestroy(): void {
    onModuleDestroyLifecycle(this.cleanupInterval);
  }

  /** Leitura unificada da chave OpenAI (process.env → ConfigService) */
  private getOpenAiKey(): string | undefined {
    return getOpenAiKeyFn(this.configService);
  }

  private writeStreamChunk(
    res: Response,
    data: { content?: string; chunk?: string; done?: boolean; error?: string },
  ): void {
    writeStreamChunkFn(res, data);
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
    return buildGuestMindSignalsFn(
      this.prisma,
      {
        attentionService: this.attentionService,
        valenceAggregatorService: this.valenceAggregatorService,
        mindBeliefService: this.mindBeliefService,
        mindConceptService: this.mindConceptService,
        selfHealthService: this.selfHealthService,
        selfGapsService: this.selfGapsService,
        riskClassService: this.riskClassService,
      },
      this.logger,
      workspaceId,
      userMessage,
    );
  }

  /**
   * 💬 Chat com streaming SSE para visitantes
   */
  async chat(message: string, sessionId: string, req: Request, res: Response): Promise<void> {
    // SSE + manual CORS headers (extracted: see guest-chat.sse.helpers.ts).
    configureGuestSseResponse(req, res, sessionId);

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

      // w4-guestchat-loop: open the predictive-coding loop on the LIVE guest SSE
      // surface. predictChatReply persists the canonical `P(reply|...)`
      // RAC_MindPrediction row that applyChatTerminalHooks → resolveChatReplySurprise
      // later resolves (findOpen + resolve + observeBinary). Without this producer
      // the guest surface created 0 prediction rows and the predict→surprise link
      // never fired here. Fire-and-forget; @Optional MindPredictorService no-ops
      // when absent (unit tests). Mirrors KloelReplyEngineService.buildAssistantReply.
      predictChatReply(this.mindPredictorService, this.logger, {
        workspaceId: chatWsId,
        surface: 'guest',
      });

      emitGuestEngageDecision(this.spineEmitter, chatWsId, message.length);

      // DETERMINISTIC ACTION ROUTER — classify intent and execute tools
      // BEFORE the LLM. The streaming path must not let the LLM decide whether
      // to act; IntentRouter classifies and the deterministic planner/executor
      // runs the real tool. The LLM is only used to converse when no action is
      // matched. Mirrors chatSync() so SSE and sync share one action contract.
      const deterministicWsId = this.resolveDefaultWorkspaceId();
      if (deterministicWsId && this.toolDispatcher) {
        const actionReply = await runDeterministicAction(
          message,
          sessionId,
          deterministicWsId,
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
            workspaceId: chatWsId,
            surface: 'guest',
            startedAt,
          });
          this.writeStreamChunk(res, {
            content: actionReply,
            chunk: actionReply,
            done: false,
          });
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        }
      }

      const mindSignals = await this.buildGuestMindSignals(chatWsId, message);

      const { conversation, contextMessages } = await this.buildGuestMessages(message, sessionId);

      // Inject mindSignals into the cognitive context for the LLM
      injectGuestMindSignals(contextMessages, mindSignals);
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
    return resolveDefaultWorkspaceIdFn();
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

    // w4-guestchat-loop: open the predictive-coding loop on the guest sync path
    // too (chatSync mirrors chat()). Same producer → resolved by the terminal
    // hook's resolveChatReplySurprise. Fire-and-forget; @Optional no-ops when absent.
    predictChatReply(this.mindPredictorService, this.logger, {
      workspaceId: metricWsId,
      surface: 'guest',
    });

    emitGuestEngageDecision(this.spineEmitter, metricWsId, message.length);

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

      injectGuestMindSignals(contextMessages, mindSignals);
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
    return buildTerminalDeps(
      this.decisionOutcomeService,
      this.mindBeliefService,
      this.mindSurpriseService,
      this.mindObservability,
      this.logger,
      this.opsAlert,
      this._lastCognitiveState,
    );
  }

  // ── Conversation persistence delegators ──

  private async persistConversation(
    sessionId: string,
    conversation: GuestConversation,
  ): Promise<void> {
    return persistGuestConversation(
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
    return persistGuestConversationMessage(
      sessionId,
      role,
      content,
      this.redis,
      this.conversations,
      this.logger,
    );
  }

  /**
   * 📊 Estatísticas (para debug)
   */
  getStats(): { activeSessions: number; totalMessages: number } {
    return getConversationStats(this.conversations);
  }
}
