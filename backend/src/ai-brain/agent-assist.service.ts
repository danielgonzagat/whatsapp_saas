import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import {
  AgentAssistWalletAccessError,
  type AssistantAction,
  buildPitchMessages,
  buildSentimentMessages,
  buildSuggestReplyMessages,
  buildSummaryMessages,
  chargeAiUsageIfNeeded,
  classifySentimentLabel,
  estimateOpenAiQuote,
  readWorkspaceId,
  refundAiUsageIfNeeded,
  settleAiUsageIfNeeded,
} from './agent-assist.helpers';

interface ExecuteAiOperationArgs<T> {
  estimatedCostCents?: bigint;
  handler: (completion: OpenAI.Chat.ChatCompletion) => T;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  model: string;
  operation: AssistantAction;
  requestId: string;
  workspaceId: string | undefined;
}

/** Agent assist service — sentiment, summary, reply suggestions and pitch generation. */
@Injectable()
export class AgentAssistService {
  private openai: OpenAI | null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly prepaidWalletService: WalletService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private async ensureBudget(workspaceId?: string | null): Promise<void> {
    if (!workspaceId) {
      return;
    }
    await this.planLimits.ensureTokenBudget(workspaceId);
  }

  private async trackUsage(workspaceId: string | undefined | null, tokens?: number): Promise<void> {
    if (!workspaceId) {
      return;
    }
    await this.planLimits.trackAiUsage(workspaceId, tokens ?? 500).catch(() => {});
  }

  private async executeAiOperation<T>(args: ExecuteAiOperationArgs<T>): Promise<T> {
    const { estimatedCostCents, handler, messages, model, operation, requestId, workspaceId } =
      args;
    const usageCharged = await chargeAiUsageIfNeeded({
      walletService: this.prepaidWalletService,
      workspaceId,
      requestId,
      assistantAction: operation,
      metadata: { model },
      estimatedCostCents,
    });
    try {
      await this.ensureBudget(workspaceId);
      const completion = await chatCompletionWithRetry(this.openai, { model, messages });
      if (estimatedCostCents !== undefined && usageCharged) {
        await settleAiUsageIfNeeded({
          walletService: this.prepaidWalletService,
          workspaceId,
          requestId,
          assistantAction: operation,
          model,
          usage: completion?.usage,
        });
      }
      await this.trackUsage(workspaceId, completion?.usage?.total_tokens);
      return handler(completion);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentAssistService.handler');
      if (!(error instanceof AgentAssistWalletAccessError)) {
        await refundAiUsageIfNeeded({
          walletService: this.prepaidWalletService,
          workspaceId,
          requestId,
          assistantAction: operation,
          reason: 'ai_assistant_provider_exception',
        });
      }
      throw error;
    }
  }

  /**
   * Classify the sentiment of free-form text.
   *
   * @param text - Text to classify.
   * @param workspaceId - Optional workspace id for billing/limits.
   * @param requestId - Idempotency key for the wallet hold (defaults to a fresh UUID).
   * @returns Sentiment label plus the raw model output.
   */
  async analyzeSentiment(text: string, workspaceId?: string, requestId: string = randomUUID()) {
    const startedAt = Date.now();
    const trimmedText = text.trim();

    if (!this.openai) {
      if (workspaceId) {
        await this.prisma.autopilotEvent
          .create({
            data: {
              workspaceId,
              intent: 'AI_ASSIST',
              action: 'ANALYZE_SENTIMENT',
              status: 'skipped',
              reason: 'openai_unavailable',
              meta: {
                textPreview: trimmedText.slice(0, 180),
                latencyMs: Date.now() - startedAt,
                sentiment: 'neutral',
              },
            },
          })
          .catch(() => {});
      }
      return { sentiment: 'neutral', score: 0 };
    }

    const model = resolveBackendOpenAIModel('brain');
    const messages = buildSentimentMessages(text);
    const estimatedCostCents = estimateOpenAiQuote(model, messages);
    try {
      const result = await this.executeAiOperation({
        workspaceId,
        requestId,
        operation: 'analyze_sentiment',
        model,
        messages,
        handler: (completion) => {
          const content = completion.choices[0]?.message?.content?.toLowerCase() || '';
          return { sentiment: classifySentimentLabel(content), raw: content };
        },
        estimatedCostCents,
      });
      if (workspaceId) {
        await this.prisma.autopilotEvent
          .create({
            data: {
              workspaceId,
              intent: 'AI_ASSIST',
              action: 'ANALYZE_SENTIMENT',
              status: 'executed',
              reason: 'analyze_sentiment_succeeded',
              meta: {
                textPreview: trimmedText.slice(0, 180),
                latencyMs: Date.now() - startedAt,
                sentiment: result.sentiment,
              },
            },
          })
          .catch(() => {});
      }
      return result;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentAssistService.now');
      if (workspaceId) {
        await this.prisma.autopilotEvent
          .create({
            data: {
              workspaceId,
              intent: 'AI_ASSIST',
              action: 'ANALYZE_SENTIMENT',
              status: 'error',
              reason: 'analyze_sentiment_failed',
              meta: {
                textPreview: trimmedText.slice(0, 180),
                latencyMs: Date.now() - startedAt,
                errorName: error instanceof Error ? error.name : 'Error',
              },
            },
          })
          .catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Summarize a conversation in three lines.
   *
   * @param conversationId - Conversation to summarize.
   * @param workspaceId - Optional workspace id; falls back to the conversation's workspace.
   * @param requestId - Idempotency key for the wallet hold (defaults to a fresh UUID).
   */
  async summarizeConversation(
    conversationId: string,
    workspaceId: string,
    requestId: string = randomUUID(),
  ) {
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 30 },
      },
    });
    if (!convo) {
      return { summary: '' };
    }
    const effectiveWorkspaceId = readWorkspaceId(workspaceId) || readWorkspaceId(convo.workspaceId);
    const history = convo.messages.map((m) => `[${m.direction}] ${m.content}`).join('\n');
    if (!this.openai) {
      return { summary: history.slice(0, 200) };
    }

    const model = resolveBackendOpenAIModel('brain');
    const messages = buildSummaryMessages(history);
    const estimatedCostCents = estimateOpenAiQuote(model, messages);
    return this.executeAiOperation({
      workspaceId: effectiveWorkspaceId,
      requestId,
      operation: 'summarize_conversation',
      model,
      messages,
      handler: (completion) => ({ summary: completion.choices[0]?.message?.content || '' }),
      estimatedCostCents,
    });
  }

  /**
   * Suggest a reply to the latest message in a conversation.
   *
   * @param workspaceId - Owning workspace id (required for billing).
   * @param conversationId - Conversation context.
   * @param prompt - Optional user prompt prepended to the latest message.
   * @param requestId - Idempotency key for the wallet hold.
   */
  async suggestReply(
    workspaceId: string,
    conversationId: string,
    prompt?: string,
    requestId: string = randomUUID(),
  ) {
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    const latest = convo?.messages?.[0]?.content || '';
    if (!this.openai) {
      return { suggestion: prompt ? `${prompt} ${latest}` : latest };
    }
    const model = resolveBackendOpenAIModel('writer');
    const messages = buildSuggestReplyMessages(prompt, latest);
    const estimatedCostCents = estimateOpenAiQuote(model, messages);
    return this.executeAiOperation({
      workspaceId,
      requestId,
      operation: 'suggest_reply',
      model,
      messages,
      handler: (completion) => ({
        suggestion: completion.choices[0]?.message?.content || latest,
      }),
      estimatedCostCents,
    });
  }

  /**
   * Generate a short, persuasive sales pitch from the recent conversation context.
   *
   * @param conversationId - Conversation context.
   * @param workspaceId - Owning workspace id (required for billing).
   * @param requestId - Idempotency key for the wallet hold.
   */
  async generatePitch(
    conversationId: string,
    workspaceId: string,
    requestId: string = randomUUID(),
  ) {
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    const context = convo?.messages?.map((m) => m.content).join('\n') || '';
    const base = context || 'oferta rápida';
    if (!this.openai) {
      return {
        pitch: `Tenho uma condição especial hoje. Quer aproveitar? (${base.slice(0, 80)})`,
      };
    }
    const model = resolveBackendOpenAIModel('brain');
    const messages = buildPitchMessages(base);
    const estimatedCostCents = estimateOpenAiQuote(model, messages);
    return this.executeAiOperation({
      workspaceId,
      requestId,
      operation: 'generate_pitch',
      model,
      messages,
      handler: (completion) => ({
        pitch: completion.choices[0]?.message?.content || base,
      }),
      estimatedCostCents,
    });
  }
}
