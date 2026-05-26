import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { createTextLlmClient } from '../lib/llm-provider';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { forEachSequential } from '../common/async-sequence';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
import { UnifiedAgentActionsService } from './unified-agent-actions.service';
import { AgentRuntimeContextService } from './agent-runtime';
import { AbiBuilderService } from './abi/abi-builder.service';
import { AbiSnapshotCacheService } from './abi/abi-snapshot-cache.service';
export type { ToolArgs, ActionEntry } from './unified-agent.types';
import type { ToolArgs, ActionEntry, PredecidedAction } from './unified-agent.types';
import {
  buildPredecidedActionDraft,
  executePredecidedAgentActions,
} from './unified-agent-predecided-actions.part';
import { MindCapabilityExecutor } from './mind/coordination';
import { UnifiedAgentToolExecutorService } from './unified-agent-tool-executor';
import { buildAgentCognitiveState } from './unified-agent.cognitive-state.helpers';

import type { UnknownRecord } from '../common/types';

function isAllowedTool(toolName: string, allowedTools?: string[]): boolean {
  return !allowedTools || allowedTools.includes(toolName);
}

const UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED =
  'Primary LLM configuration is required for unified agent generation';

function formatPromptValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatPromptValue).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${formatPromptValue(record[key])}`)
      .join(',')}}`;
  }
  if (typeof value === 'string') {
    return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  return Object.prototype.toString.call(value);
}

/**
 * KLOEL Unified Agent Service — orchestrator.
 *
 * This service coordinates context loading, LLM calls, tool dispatch, and
 * response composition. All heavy logic lives in the sub-services injected
 * here. The constructor, processMessage, and executeToolAction router are the
 * only concerns of this file.
 */
/** Idempotency: enforced at HTTP layer via @Idempotent() guard + Stripe idempotencyKey. */
@Injectable()
export class UnifiedAgentService {
  private readonly logger = StructuredLogger.from(UnifiedAgentService.name);
  private readonly openai: OpenAI | null;
  private readonly primaryBrainModel: string;
  private readonly fallbackBrainModel: string;
  private readonly writerModel: string;
  private readonly fallbackWriterModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
    private readonly ctx: UnifiedAgentContextService,
    private readonly response: UnifiedAgentResponseService,
    private readonly actions: UnifiedAgentActionsService,
    @Optional() private readonly agentRuntime?: AgentRuntimeContextService,
    @Optional() private readonly abiBuilder?: AbiBuilderService,
    @Optional() private readonly abiSnapshotCache?: AbiSnapshotCacheService,
    @Optional() private readonly brainCapability?: MindCapabilityExecutor,
    @Optional() private readonly toolExecutor?: UnifiedAgentToolExecutorService,
  ) {
    this.openai = createTextLlmClient(this.config);
    this.primaryBrainModel = resolveBackendOpenAIModel('brain', this.config);
    this.fallbackBrainModel = resolveBackendOpenAIModel('brain_fallback', this.config);
    this.writerModel = resolveBackendOpenAIModel('writer', this.config);
    this.fallbackWriterModel = resolveBackendOpenAIModel('writer_fallback', this.config);
  }

  async processIncomingMessage(params: {
    workspaceId: string;
    phone: string;
    message: string;
    contactId?: string;
    channel?: string;
    context?: UnknownRecord;
    executeTools?: boolean;
  }): Promise<{
    reply?: string;
    response?: string;
    actions: ActionEntry[];
    intent: string;
    confidence: number;
  }> {
    const result = await this.processMessage({
      workspaceId: params.workspaceId,
      contactId: params.contactId || '',
      phone: params.phone,
      message: params.message,
      context: {
        channel: params.channel || 'whatsapp',
        executeTools: params.executeTools !== false,
        ...(params.context || {}),
      },
    });

    return {
      actions: result.actions,
      intent: result.intent,
      confidence: result.confidence,
      ...(result.response !== undefined
        ? { reply: result.response, response: result.response }
        : {}),
    };
  }

  async processMessage(params: {
    allowedTools?: string[];
    predecidedActions?: PredecidedAction[];
    workspaceId: string;
    contactId: string;
    phone: string;
    message: string;
    context?: UnknownRecord;
  }): Promise<{
    actions: ActionEntry[];
    response?: string;
    intent: string;
    confidence: number;
  }> {
    const { workspaceId, contactId, phone, message, context } = params;

    const predecidedActions = params.predecidedActions ?? [];

    if (!this.openai && predecidedActions.length === 0) {
      this.logger.warn('OpenAI not configured');
      return this.response.buildFallbackResult(message);
    }

    // 1. Load workspace / contact / history / products in parallel
    const [workspace, contact, conversationHistory, products] = await Promise.all([
      this.ctx.getWorkspaceContext(workspaceId),
      this.ctx.getContactContext(workspaceId, contactId, phone),
      this.ctx.getConversationHistory(workspaceId, contactId, 0, phone),
      this.ctx.getProducts(workspaceId),
    ]);

    // 1b. Load AI config per product (commercial brain)
    const productIds = products
      .map((product: UnknownRecord) => {
        const productValue = this.ctx.readRecord(product.value);
        return this.ctx.readOptionalText(productValue.id) || this.ctx.readOptionalText(product.id);
      })
      .filter((productId): productId is string => Boolean(productId));
    let aiConfigs: UnknownRecord[] = [];
    if (productIds.length > 0) {
      try {
        aiConfigs = await this.prisma.productAIConfig.findMany({
          take: 50,
          where: { productId: { in: productIds } },
          select: {
            id: true,
            productId: true,
            tone: true,
            persistenceLevel: true,
            messageLimit: true,
            customerProfile: true,
            positioning: true,
            objections: true,
            salesArguments: true,
          },
        });
      } catch {
        /* ProductAIConfig may not exist yet */
      }
    }

    const compressedContext = await this.ctx.buildAndPersistCompressedContext(
      workspaceId,
      contactId,
      phone,
      contact,
    );
    const tacticalHint = this.ctx.buildLeadTacticalHint({
      leadName: this.ctx.isRecord(contact) ? this.ctx.readText(contact.name).trim() : '',
      currentMessage: message,
      conversationHistory,
    });

    // 2. Build system prompt and style instruction
    const agentRuntimeContext = await this.buildAgentRuntimeContext({
      workspaceId,
      channel: this.ctx.readText(context?.channel, 'whatsapp'),
      message,
      contactId,
      ...(params.allowedTools !== undefined ? { allowedTools: params.allowedTools } : {}),
    });
    const systemPrompt = [
      `COGNITIVE STATE: capabilities.available=[], memory.workingMemory=[], memory.episodicRefs=[], memory.consolidatedRefs=[], beliefs=[], predictions.active=[], pulseTruth.verdict=INSUFFICIENT_EVIDENCE.`,
      this.ctx.buildSystemPrompt(workspace, products, aiConfigs),
      agentRuntimeContext.systemPromptBlock,
    ].join('\n\n');
    const stylePolicy = this.response.buildReplyStyleInstruction(
      message,
      conversationHistory.length,
    );
    const contactData: Record<string, unknown> = this.ctx.isRecord(contact) ? contact : {};
    const contactName = this.ctx.readText(contactData.name).trim() || phone;
    const contactSentiment = this.ctx.readText(contactData.sentiment).trim() || 'NEUTRAL';
    const leadScore = this.ctx.readText(contactData.leadScore, '0');
    const tagNames = this.ctx.readTagList(contactData.tags);

    // 3. Build messages array
    const additionalContext = context ? formatPromptValue(context) : '';
    const currentInput = {
      raw: message,
      channel: this.ctx.readText(context?.channel, 'whatsapp'),
      arrivalTimestamp: new Date().toISOString(),
    };
    const cognitiveState = await buildAgentCognitiveState({
      workspaceId,
      currentInput,
      abiBuilder: this.abiBuilder,
      abiSnapshotCache: this.abiSnapshotCache,
      brainCapability: this.brainCapability,
      logger: this.logger,
    });

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'Voce e o assistente comercial Kloel. Suas capacidades dependem do workspace e das ferramentas disponiveis. Use as tools quando o usuario pedir acoes reais. Nao invente capacidades que nao tem. Seja honesto sobre suas limitacoes.',
      },
      ...conversationHistory,
      {
        role: 'user',
        content: JSON.stringify({
          contextInstruction:
            'Your cognitive state (cognitiveState) is your source of truth. You MUST respect it. Your capabilities are LIMITED to what cognitiveState.capabilities.available lists. Your memories are ONLY what cognitiveState.memory contains. Your beliefs are ONLY what cognitiveState.beliefs contains. NEVER claim to have capabilities, memories, beliefs, or predictions that are not present in your cognitiveState. If a field is empty, say it is empty.',
          cognitiveState,
          runtimeContext: {
            workspaceProductContext: systemPrompt,
            compressedMemory: compressedContext || null,
            additionalContext,
            tacticalHint: tacticalHint || 'responder com clareza, valor concreto e próximo passo.',
            responsePolicy: stylePolicy,
          },
          contact: {
            name: contactName,
            sentiment: contactSentiment,
            leadScore,
            tags: tagNames,
          },
          currentInput,
        }),
      },
    ];

    if (predecidedActions.length > 0) {
      const actionsList = await executePredecidedAgentActions({
        ...(params.allowedTools !== undefined ? { allowedTools: params.allowedTools } : {}),
        contactId,
        ...(context !== undefined ? { context } : {}),
        executeTool: this.executeToolAction.bind(this),
        logAutopilotEvent: this.actions.logAutopilotEvent.bind(this.actions),
        phone,
        predecidedActions,
        workspaceId,
      });
      const intent = this.response.extractIntent(actionsList, message);
      const draftedReply = await this.response.composeWriterReply(
        this.openai,
        this.writerModel,
        this.fallbackWriterModel,
        {
          workspaceId,
          customerMessage: message,
          assistantDraft: buildPredecidedActionDraft(actionsList),
          actions: actionsList,
          historyTurns: conversationHistory.length,
        },
      );

      await this.recordAgentRuntimeTurn({
        workspaceId,
        channel: this.ctx.readText(context?.channel, 'whatsapp'),
        userMessage: message,
        ...(draftedReply !== undefined ? { assistantMessage: draftedReply } : {}),
        contactId,
        intent,
        confidence: actionsList.length > 0 ? 0.85 : 0.55,
        actions: actionsList.map((action) => ({
          toolName: action.tool,
          success: this.actionSucceeded(action.result),
          result: action.result,
        })),
      });

      return {
        actions: actionsList,
        ...(draftedReply !== undefined ? { response: draftedReply } : {}),
        intent,
        confidence: actionsList.length > 0 ? 0.85 : 0.55,
      };
    }

    // 4. Ask the LLM to verbalize only; code-native actions enter via predecidedActions.
    let llmResponse: OpenAI.Chat.ChatCompletion;
    try {
      await this.planLimits.ensureTokenBudget(params.workspaceId);
      const openai = this.openai;
      if (!openai) {
        const error = new Error();
        error.message = UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED;
        throw error;
      }
      llmResponse = await chatCompletionWithFallback(
        openai,
        {
          model: this.primaryBrainModel,
          messages,
          temperature: 0.82,
          top_p: 0.9,
        },
        this.fallbackBrainModel,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
      this.logger.error(`OpenAI agent processing failed, using fallback: ${msg}`);
      return this.response.buildFallbackResult(message);
    }
    if (!llmResponse) {
      return this.response.buildFallbackResult(message);
    }
    const firstChoice = llmResponse.choices[0];
    if (!firstChoice) {
      return this.response.buildFallbackResult(message);
    }
    await this.planLimits
      .trackAiUsage(params.workspaceId, llmResponse.usage?.total_tokens ?? 500)
      .catch(() => {});

    const assistantMessage = firstChoice.message;
    const actionsList: ActionEntry[] = [];

    // 5. Process tool calls
    const executeTools = context?.executeTools !== false;
    if (executeTools && assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      await forEachSequential(assistantMessage.tool_calls, async (toolCall) => {
        if (toolCall.type !== 'function') {
          return;
        }
        const toolName = toolCall.function.name;
        if (!isAllowedTool(toolName, params.allowedTools)) {
          this.logger.warn(
            `Blocked disallowed agent tool call: workspaceId=${workspaceId} tool=${toolName}`,
          );
          const blockedResult = { blocked: true, reason: 'capability_not_allowed' };
          actionsList.push({ tool: toolName, args: {}, result: blockedResult });
          await this.actions.logAutopilotEvent(workspaceId, contactId, toolName, {}, blockedResult);
          return;
        }
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          this.logger.warn(`Failed to parse tool args for ${toolName}`);
        }
        const result = await this.executeToolAction(
          workspaceId,
          contactId,
          phone,
          toolName,
          toolArgs,
          context,
        );
        actionsList.push({ tool: toolName, args: toolArgs, result });
        await this.actions.logAutopilotEvent(workspaceId, contactId, toolName, toolArgs, result);
      });
    }

    // 6. Extract intent, confidence, and compose final reply
    const intent = this.response.extractIntent(actionsList, message);
    const confidence = this.response.calculateConfidence(actionsList, llmResponse);
    const draftedReply = await this.response.composeWriterReply(
      this.openai,
      this.writerModel,
      this.fallbackWriterModel,
      {
        workspaceId,
        customerMessage: message,
        assistantDraft: assistantMessage.content,
        actions: actionsList,
        historyTurns: conversationHistory.length,
      },
    );

    await this.recordAgentRuntimeTurn({
      workspaceId,
      channel: this.ctx.readText(context?.channel, 'whatsapp'),
      userMessage: message,
      ...(draftedReply !== undefined ? { assistantMessage: draftedReply } : {}),
      contactId,
      intent,
      confidence,
      actions: actionsList.map((action) => ({
        toolName: action.tool,
        success: this.actionSucceeded(action.result),
        result: action.result,
      })),
    });

    return {
      actions: actionsList,
      ...(draftedReply !== undefined ? { response: draftedReply } : {}),
      intent,
      confidence,
    };
  }

  /**
   * Public API: execute a single named tool directly.
   */
  async executeTool(
    tool: string,
    args: ToolArgs,
    ctx: { workspaceId: string; contactId?: string; phone?: string },
  ): Promise<unknown> {
    if (!this.toolExecutor) {
      throw new Error('UnifiedAgentToolExecutorService is not wired in this context');
    }
    return this.toolExecutor.execute(
      ctx.workspaceId,
      ctx.contactId || '',
      ctx.phone || '',
      tool,
      args,
    );
  }

  /** Build quoted reply plan (delegates to response service). */
  async buildQuotedReplyPlan(params: {
    workspaceId: string;
    contactId?: string;
    phone: string;
    draftReply: string;
    customerMessages: Array<{ content: string; quotedMessageId: string }>;
  }): Promise<Array<{ quotedMessageId: string; text: string }>> {
    return this.response.buildQuotedReplyPlan(
      this.openai,
      this.writerModel,
      this.fallbackWriterModel,
      this.planLimits,
      params,
    );
  }

  // ───────── tool router ─────────

  private async executeToolAction(
    workspaceId: string,
    contactId: string,
    phone: string,
    tool: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ): Promise<unknown> {
    if (!this.toolExecutor) {
      return { success: false, error: 'tool_executor_unavailable' };
    }
    return this.toolExecutor.execute(workspaceId, contactId, phone, tool, args, context);
  }

  private actionSucceeded(result: unknown): boolean {
    return (
      typeof result === 'object' &&
      result !== null &&
      ((result as Record<string, unknown>).success === true ||
        (result as Record<string, unknown>).ok === true ||
        (result as Record<string, unknown>).executed === true)
    );
  }
  private async buildAgentRuntimeContext(params: {
    workspaceId: string;
    channel: string;
    message: string;
    contactId?: string;
    allowedTools?: string[];
  }): Promise<{ systemPromptBlock: string }> {
    return this.agentRuntime?.buildContext(params) ?? { systemPromptBlock: '' };
  }
  private async recordAgentRuntimeTurn(params: {
    workspaceId: string;
    channel: string;
    userMessage: string;
    assistantMessage?: string;
    contactId?: string;
    intent?: string;
    confidence?: number;
    actions?: Array<{ toolName: string; success: boolean; result?: unknown }>;
  }): Promise<void> {
    await this.agentRuntime?.recordTurnOutcome(params);
  }
}
