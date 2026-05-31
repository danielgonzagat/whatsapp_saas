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
import {
  UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED,
  formatPromptValue,
  isAllowedTool,
} from './unified-agent.helpers';
import {
  PRODUCT_AI_CONFIG_BATCH_SIZE,
  PRODUCT_AI_CONFIG_SELECT,
  SEED_SYSTEM_MESSAGE_CONTENT,
  buildAgentUserPayload,
  buildBlockedActionEntry,
  buildBlockedToolResult,
  buildContactSummary,
  buildCurrentInput,
  buildLayeredSystemPrompt,
  confidenceForPredecidedActions,
  extractProductIds,
  mapActionsForTurnOutcome,
  parseToolArguments,
} from './unified-agent.service.helpers';

import type { UnknownRecord } from '../common/types';

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
    const productIds = extractProductIds(products, {
      readRecord: this.ctx.readRecord.bind(this.ctx),
      readOptionalText: this.ctx.readOptionalText.bind(this.ctx),
    });
    let aiConfigs: UnknownRecord[] = [];
    if (productIds.length > 0) {
      try {
        aiConfigs = await this.prisma.productAIConfig.findMany({
          take: PRODUCT_AI_CONFIG_BATCH_SIZE,
          where: { productId: { in: productIds } },
          select: PRODUCT_AI_CONFIG_SELECT,
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
    const systemPrompt = buildLayeredSystemPrompt({
      workspaceProductBlock: this.ctx.buildSystemPrompt(workspace, products, aiConfigs),
      agentRuntimeBlock: agentRuntimeContext.systemPromptBlock,
    });
    const stylePolicy = this.response.buildReplyStyleInstruction(
      message,
      conversationHistory.length,
    );
    const contactData: Record<string, unknown> = this.ctx.isRecord(contact) ? contact : {};
    const contactSummary = buildContactSummary({
      rawName: this.ctx.readText(contactData.name),
      rawSentiment: this.ctx.readText(contactData.sentiment),
      rawLeadScore: this.ctx.readText(contactData.leadScore, '0'),
      tags: this.ctx.readTagList(contactData.tags),
      fallbackIdentifier: phone,
    });

    // 3. Build messages array
    const additionalContext = context ? formatPromptValue(context) : '';
    const currentInput = buildCurrentInput({
      message,
      channel: this.ctx.readText(context?.channel, 'whatsapp'),
    });
    const cognitiveState = await buildAgentCognitiveState({
      workspaceId,
      currentInput,
      ...(this.abiBuilder !== undefined ? { abiBuilder: this.abiBuilder } : {}),
      ...(this.abiSnapshotCache !== undefined ? { abiSnapshotCache: this.abiSnapshotCache } : {}),
      ...(this.brainCapability !== undefined ? { brainCapability: this.brainCapability } : {}),
      logger: this.logger,
    });

    const userPayload = buildAgentUserPayload({
      cognitiveState,
      systemPrompt,
      compressedContext,
      additionalContext,
      tacticalHint,
      stylePolicy,
      contact: contactSummary,
      currentInput,
    });

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: SEED_SYSTEM_MESSAGE_CONTENT,
      },
      ...conversationHistory,
      {
        role: 'user',
        content: JSON.stringify(userPayload),
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
          contactMessage: message,
          assistantDraft: buildPredecidedActionDraft(actionsList),
          actions: actionsList,
          historyTurns: conversationHistory.length,
        },
      );

      const predecidedConfidence = confidenceForPredecidedActions(actionsList);
      await this.recordAgentRuntimeTurn({
        workspaceId,
        channel: this.ctx.readText(context?.channel, 'whatsapp'),
        userMessage: message,
        ...(draftedReply !== undefined ? { assistantMessage: draftedReply } : {}),
        contactId,
        intent,
        confidence: predecidedConfidence,
        actions: mapActionsForTurnOutcome(actionsList),
      });

      return {
        actions: actionsList,
        ...(draftedReply !== undefined ? { response: draftedReply } : {}),
        intent,
        confidence: predecidedConfidence,
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
          const blockedResult = buildBlockedToolResult();
          actionsList.push(buildBlockedActionEntry(toolName));
          await this.actions.logAutopilotEvent(workspaceId, contactId, toolName, {}, blockedResult);
          return;
        }
        const toolArgs = parseToolArguments(toolCall.function.arguments, () => {
          this.logger.warn(`Failed to parse tool args for ${toolName}`);
        });
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
        contactMessage: message,
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
      actions: mapActionsForTurnOutcome(actionsList),
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
