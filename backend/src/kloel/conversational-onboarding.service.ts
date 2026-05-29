import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Response } from 'express';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { createTextLlmClient } from '../lib/llm-provider';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithRetry } from './openai-wrapper';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { IntentRouterService } from './intent-router/intent-router.service';
import { AttentionService } from './mind/attention.service';
import { ValenceAggregatorService } from './mind/valence-aggregator.service';
import { ValenceTaggerService } from './mind/valence-tagger.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindConceptService } from './mind/memory/mind-concepts.service';
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
import { RiskClassService } from './risk-class/risk-class.service';
import { buildMindSignals } from './mind/build-mind-signals.helper';
import { SpineEmitterService } from './spine/spine-emitter.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindVerbalizerService } from './mind/synthetic/mind-verbalizer.service';
import { MindAutonomyCoordinator } from './mind/coordination/mind-autonomy-coordinator.service';
import { MindBanditService } from './mind/policy/mind-bandit.service';
import { MindCaseMemoryService } from './mind/memory/mind-case-memory.service';
import { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import { MindPerceptionService } from './mind/perception/mind-perception.service';
import { AgentAssistService } from './mind/knowledge/agent-assist.service';
import { KnowledgeBaseService } from './mind/knowledge/knowledge-base.service';
import { VectorService } from './mind/knowledge/vector.service';
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  closeChatReplyOutcome,
} from './kloel-reply-engine.decision-outcome.helpers';
import {
  applyOnboardingSuccessHooks,
  applyOnboardingFailureHooks,
} from './conversational-onboarding.cognitive-hooks.helper';
import {
  buildOnboardingMindSignalsDeps,
  emitOnboardingCognitionDecision,
} from './conversational-onboarding.mind-deps.helpers';
import { MindEventProcessorService } from './mind/runtime/mind-event-processor.service';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint
import {
  ONBOARDING_SAFE_SETUP_TOOL_NAMES,
  ONBOARDING_SAFE_SETUP_TOOLS,
  type OnboardingMessage,
  type PrismaWithDynamicModels,
} from './conversational-onboarding.types';
import { CONVERSATIONAL_ONBOARDING_PROMPT } from './conversational-onboarding.prompt';
import { writeSseResponse, buildOnboardingFallback } from './conversational-onboarding.helpers';
// tokenBudget: enforced via PlanLimitsService.ensureTokenBudget before each LLM call

/** Conversational onboarding service. */
@Injectable()
export class ConversationalOnboardingService {
  private readonly logger = StructuredLogger.from(ConversationalOnboardingService.name);
  private openai: OpenAI;
  private readonly prismaExt: PrismaWithDynamicModels;

  constructor(
    prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly toolsService: ConversationalOnboardingToolsService,
    @Optional() private readonly abiBuilder?: AbiBuilderService,
    @Optional() private readonly intentRouter?: IntentRouterService,
    @Optional() private readonly attentionService?: AttentionService,
    @Optional() private readonly valenceAggregatorService?: ValenceAggregatorService,
    @Optional() private readonly mindBeliefService?: MindBeliefService,
    @Optional() private readonly mindConceptService?: MindConceptService,
    @Optional() private readonly spine?: SpineEmitterService,
    @Optional() private readonly selfHealthService?: SelfHealthService,
    @Optional() private readonly selfGapsService?: SelfGapsService,
    @Optional() private readonly decisionOutcomeService?: DecisionOutcomeService,
    @Optional() private readonly riskClassService?: RiskClassService,
    @Optional() private readonly mindSurpriseService?: MindSurpriseService,
    @Optional() private readonly mindVerbalizerService?: MindVerbalizerService,
    @Optional() private readonly mindAutonomyCoordinator?: MindAutonomyCoordinator,
    @Optional() private readonly mindBanditService?: MindBanditService,
    @Optional() private readonly mindCaseMemoryService?: MindCaseMemoryService,
    @Optional() private readonly mindGlobalPriorService?: MindGlobalPriorService,
    @Optional() private readonly agentAssistService?: AgentAssistService,
    @Optional() private readonly mindPerceptionService?: MindPerceptionService,
    @Optional() private readonly knowledgeBaseService?: KnowledgeBaseService,
    @Optional() private readonly vectorService?: VectorService,
    @Optional() private readonly valenceTagger?: ValenceTaggerService,
    @Optional() private readonly mindEventProcessorService?: MindEventProcessorService,
  ) {
    this.prismaExt = prisma as object as PrismaWithDynamicModels;
    this.openai = createTextLlmClient() ?? new OpenAI({ apiKey: 'missing' });
    void this.mindAutonomyCoordinator; // PI-K13-D: reserved for future autonomy proposal surface
  }

  private async buildOnboardingStateMessage(
    workspaceId: string,
    userMessage: string,
  ): Promise<OnboardingMessage> {
    if (process.env['KLOEL_ONBOARDING_USE_ABI'] !== 'on' || !this.abiBuilder) {
      return { role: 'system', content: CONVERSATIONAL_ONBOARDING_PROMPT };
    }

    const now = new Date();
    const result = await this.abiBuilder.build({
      audience: 'public',
      currentInput: {
        raw: userMessage,
        parsed: { intent: 'workspace_onboarding' },
        channel: 'conversational_onboarding',
        arrivalTimestamp: now.toISOString(),
      },
      perceptionSnapshot: {
        channel: 'conversational_onboarding',
        workspaceId,
        activeStage: 'onboarding',
      },
      capabilityIds: ONBOARDING_SAFE_SETUP_TOOL_NAMES.map((name) => `onboarding.${name}`),
      now,
    });

    return {
      role: 'user',
      content: JSON.stringify(
        result.status === 'ok'
          ? { cognitiveStateAbi: result.abi }
          : {
              cognitiveStateAbiStatus: result.status,
              reason: result.reason,
              currentInput: {
                raw: userMessage,
                channel: 'conversational_onboarding',
                truthMode: 'observed',
              },
            },
      ),
    };
  }

  private parseToolArguments(rawArguments: string, functionName: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(rawArguments);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (error: unknown) {
      this.logger.warn(
        `Invalid onboarding tool arguments for ${functionName}: ${this.toolsService.toErrorMessage(error)}`,
      );
      return {};
    }
  }

  private async runOnboardingCompletion(
    workspaceId: string,
    messages: OnboardingMessage[],
    role: 'brain' | 'writer',
  ): Promise<OpenAI.Chat.ChatCompletion> {
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
    } catch (err: unknown) {
      (err as Record<string, unknown>).__onboarding_reason = 'token_budget';
      throw err;
    }
    this.logger.log('Calling primary LLM for onboarding', {
      context: 'ConversationalOnboardingService.runOnboardingCompletion',
      workspaceId,
      role,
      model: resolveBackendOpenAIModel(role),
      messageCount: messages.length,
    });
    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await chatCompletionWithRetry(this.openai, {
        model: resolveBackendOpenAIModel(role),
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        tools: ONBOARDING_SAFE_SETUP_TOOLS,
        tool_choice: ONBOARDING_SAFE_SETUP_TOOLS.length > 0 ? 'auto' : 'none',
        temperature: 0.7,
        max_tokens: 1000,
      });
    } catch (err: unknown) {
      (err as Record<string, unknown>).__onboarding_reason = 'llm_call';
      throw err;
    }
    await this.planLimits
      .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
      .catch((err: unknown) => {
        this.logger.warn(
          'Failed to track AI usage for onboarding',
          err instanceof Error ? err.message : String(err),
          { context: 'ConversationalOnboardingService.runOnboardingCompletion', workspaceId },
        );
      });
    return response;
  }

  private async executeAndAppendToolCalls(
    workspaceId: string,
    messages: OnboardingMessage[],
    toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      if (!('function' in toolCall)) {
        continue;
      }
      const functionName = toolCall.function.name;
      const args = this.parseToolArguments(toolCall.function.arguments, functionName);
      this.logger.log(`Executando tool: ${functionName}`, args);
      const result = await this.toolsService.executeToolCall(workspaceId, functionName, args);
      messages.push({ role: 'assistant', content: null, tool_calls: [toolCall] });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: functionName,
        content: JSON.stringify(result),
      });
    }
  }

  private async executeFollowupToolCalls(
    workspaceId: string,
    toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | null | undefined,
  ): Promise<void> {
    if (!toolCalls) {
      return;
    }
    for (const toolCall of toolCalls) {
      if (!('function' in toolCall)) {
        continue;
      }
      const functionName: string = toolCall.function.name;
      const args = this.parseToolArguments(toolCall.function.arguments, functionName);
      await this.toolsService.executeToolCall(workspaceId, functionName, args);
    }
  }

  private async handleInitialToolCalls(
    workspaceId: string,
    messages: OnboardingMessage[],
    initialToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  ): Promise<string> {
    await this.executeAndAppendToolCalls(workspaceId, messages, initialToolCalls);
    const finalResponse = await this.runOnboardingCompletion(workspaceId, messages, 'writer');
    const assistantChoice = finalResponse.choices[0];
    if (!assistantChoice) {
      return '';
    }
    const responseText = assistantChoice.message.content || '';
    await this.executeFollowupToolCalls(workspaceId, assistantChoice.message.tool_calls);

    return responseText;
  }

  /** Inicia ou continua o onboarding conversacional */
  async chat(workspaceId: string, userMessage: string, res?: Response): Promise<string | void> {
    const history = await this.toolsService.getOnboardingHistory(workspaceId);
    const onboardingStateMessage = await this.buildOnboardingStateMessage(workspaceId, userMessage);

    // PI-k8: record decision outcome at start of every onboarding chat reply
    const outcomeKey = buildChatOutcomeKey(workspaceId) as string;
    recordChatReplyDecision(this.decisionOutcomeService, this.logger, {
      workspaceId,
      outcomeKey,
      surface: 'onboarding',
      messageLength: userMessage.length,
    });

    let degradedReason: string | null = null;
    let intentAdvisory: string | null = null;

    // IntentRouter classification telemetry + advisory prompt injection (PI-k3→PI-k5)
    try {
      const classificationResult = this.intentRouter?.classify(userMessage, 'onboarding', []);
      if (classificationResult) {
        this.logger.log('kloel_onboarding_intent', {
          classification: classificationResult.classification,
          isChat: classificationResult.isChat,
          message_preview: userMessage.slice(0, 80),
        });
        // PI-k5: inject classification as advisory context into LLM system messages
        if (classificationResult.classification) {
          intentAdvisory = `Sinal interno: o classificador detectou intenção '${classificationResult.classification.intent}' (isChat=${classificationResult.isChat}). Use isso só como contexto, não branching.`;
        } else {
          intentAdvisory = `Sinal interno: o classificador não detectou intenção específica (isChat=${classificationResult.isChat}). Use isso só como contexto, não branching.`;
        }
      }
    } catch (err) {
      this.logger.log('kloel_onboarding_intent_skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    const messages: OnboardingMessage[] = [
      onboardingStateMessage,
      ...(intentAdvisory ? [{ role: 'system' as const, content: intentAdvisory }] : []),
      ...history.map((h) => ({
        role: h.role as OnboardingMessage['role'],
        content: h.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // Mind signals — inject attention, beliefs, concepts into onboarding prompt (PI-k5-A).
    try {
      const mindDeps = buildOnboardingMindSignalsDeps(this.prismaExt, this.logger, {
        ...(this.attentionService !== undefined ? { attentionService: this.attentionService } : {}),
        ...(this.valenceAggregatorService !== undefined
          ? { valenceAggregatorService: this.valenceAggregatorService }
          : {}),
        ...(this.mindBeliefService !== undefined
          ? { mindBeliefService: this.mindBeliefService }
          : {}),
        ...(this.mindConceptService !== undefined
          ? { mindConceptService: this.mindConceptService }
          : {}),
        ...(this.selfHealthService !== undefined
          ? { selfHealthService: this.selfHealthService }
          : {}),
        ...(this.selfGapsService !== undefined ? { selfGapsService: this.selfGapsService } : {}),
        ...(this.riskClassService !== undefined ? { riskClassService: this.riskClassService } : {}),
        ...(this.mindVerbalizerService !== undefined
          ? { mindVerbalizerService: this.mindVerbalizerService }
          : {}),
        ...(this.mindBanditService !== undefined
          ? { mindBanditService: this.mindBanditService }
          : {}),
        ...(this.mindCaseMemoryService !== undefined
          ? { mindCaseMemoryService: this.mindCaseMemoryService }
          : {}),
        ...(this.mindGlobalPriorService !== undefined
          ? { mindGlobalPriorService: this.mindGlobalPriorService }
          : {}),
        ...(this.mindPerceptionService !== undefined
          ? { mindPerceptionService: this.mindPerceptionService }
          : {}),
        ...(this.agentAssistService !== undefined
          ? { agentAssistService: this.agentAssistService }
          : {}),
        ...(this.knowledgeBaseService !== undefined
          ? { knowledgeBaseService: this.knowledgeBaseService }
          : {}),
        ...(this.vectorService !== undefined ? { vectorService: this.vectorService } : {}),
      });
      const mindSignals = await buildMindSignals(mindDeps, workspaceId, userMessage);
      messages.push({
        role: 'user',
        content: JSON.stringify({ onboardingMindSignals: mindSignals }),
      });
    } catch (error: unknown) {
      this.logger.warn('kloel_onboarding_mind_signal_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

    const completionStartMs = Date.now();
    try {
      const response = await this.runOnboardingCompletion(workspaceId, messages, 'brain');
      const assistantChoice = response.choices[0];

      // PI-k6: emit cognition.decision_made after the primary brain completion
      emitOnboardingCognitionDecision(this.spine, this.logger, {
        workspaceId,
        toolCallsCount: assistantChoice?.message?.tool_calls?.length ?? 0,
        completionStartMs,
        modelUsed: response.model,
      });
      if (!assistantChoice) {
        closeChatReplyOutcome(this.decisionOutcomeService, this.logger, {
          outcomeKey,
          outcomeName: 'chat.degraded.empty_choice',
          wonVsBaseline: false,
        });
        return '';
      }
      const assistantMessage = assistantChoice.message;
      let responseText = assistantMessage.content || '';

      const initialToolCalls = assistantMessage.tool_calls;
      if (initialToolCalls && initialToolCalls.length > 0) {
        try {
          responseText = await this.handleInitialToolCalls(workspaceId, messages, initialToolCalls);
        } catch (e: unknown) {
          degradedReason =
            ((e as Record<string, unknown>)?.__onboarding_reason as string) ?? 'tool_execution';
          throw e;
        }
      }

      try {
        await this.toolsService.saveOnboardingMessage(workspaceId, 'user', userMessage);
        await this.toolsService.saveOnboardingMessage(workspaceId, 'assistant', responseText);
      } catch (e: unknown) {
        degradedReason = 'persist';
        throw e;
      }

      const successOutcomeName = degradedReason
        ? `chat.degraded.${String(degradedReason)}`
        : 'chat.replied';
      const onSuccess = (): void => {
        applyOnboardingSuccessHooks(this.onboardingDeps(), {
          workspaceId,
          outcomeKey,
          successOutcomeName,
          degradedReason,
        });
      };
      if (res) {
        try {
          writeSseResponse(res, responseText);
        } catch (e: unknown) {
          degradedReason = 'sse_write';
          throw e;
        }
        onSuccess();
        return;
      }
      onSuccess();
      return responseText;
    } catch (error: unknown) {
      closeChatReplyOutcome(this.decisionOutcomeService, this.logger, {
        outcomeKey,
        outcomeName: 'chat.error',
        wonVsBaseline: false,
      });
      this.logger.error(
        'Erro no onboarding conversacional',
        error instanceof Error ? error.message : String(error),
        { context: 'ConversationalOnboardingService.chat', workspaceId },
      );
      const reason =
        degradedReason ??
        ((error as Record<string, unknown>)?.__onboarding_reason as string) ??
        'unknown';
      const fallback = buildOnboardingFallback(
        reason,
        {
          error,
          workspaceId,
          hasResponseHeaders: !!res,
          willingWrite: !!res,
        },
        this.logger,
      );
      const onFailure = (): void => {
        applyOnboardingFailureHooks(this.onboardingDeps(), { workspaceId, outcomeKey });
      };
      if (res) {
        writeSseResponse(res, fallback);
        onFailure();
        return;
      }
      onFailure();
      return fallback;
    }
  }

  private onboardingDeps() {
    return {
      decisionOutcomeService: this.decisionOutcomeService,
      mindBeliefService: this.mindBeliefService,
      mindSurpriseService: this.mindSurpriseService,
      mindEventProcessorService: this.mindEventProcessorService,
      valenceTagger: this.valenceTagger,
      logger: this.logger,
    };
  }

  /** Inicia o onboarding com uma mensagem de boas-vindas */
  async start(workspaceId: string): Promise<string> {
    await this.toolsService.clearOnboardingHistory(workspaceId);
    const welcomeMessage = await this.chat(workspaceId, 'Olá, quero configurar minha conta');
    return welcomeMessage as string;
  }

  /** Verifica status do onboarding */
  async getStatus(workspaceId: string) {
    // Wrap reads in $transaction to get a consistent snapshot — prevents
    // concurrent onboarding completion from returning stale status.
    return this.prismaExt.$transaction(async (tx: PrismaWithDynamicModels) => {
      const kloelMemory = tx.kloelMemory;
      const state = await kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key: 'onboarding_completed' } },
      });

      const messages = await kloelMemory.findMany({
        where: { workspaceId, key: { startsWith: 'onboarding_msg_' } },
        select: { id: true },
        take: 100,
      });

      return {
        completed: (state as { value?: unknown } | null)?.value === true,
        messagesCount: messages.length,
        hasStarted: messages.length > 0,
      };
    });
  }
}
