import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import {
  estimateOpenAiChatQuoteCostCents,
  quoteOpenAiChatActualCostCents,
} from '../wallet/provider-llm-billing';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';
import { WalletService } from '../wallet/wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';

/** Agent assist wallet access error. */
class AgentAssistWalletAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentAssistWalletAccessError';
  }
}

/** Agent assist service. */
@Injectable()
export class AgentAssistService {
  private openai: OpenAI | null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly prepaidWalletService: WalletService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private readWorkspaceId(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private async ensureBudget(workspaceId?: string | null) {
    if (!workspaceId) {
      return;
    }
    await this.planLimits.ensureTokenBudget(workspaceId);
  }

  private async trackUsage(workspaceId: string | undefined | null, tokens?: number) {
    if (!workspaceId) {
      return;
    }
    await this.planLimits.trackAiUsage(workspaceId, tokens ?? 500).catch(() => {});
  }

  private insufficientWalletMessage() {
    return 'Saldo insuficiente na wallet prepaid para usar o assistente de IA. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
  }

  private async chargeAiUsageIfNeeded(
    workspaceId: string | undefined | null,
    requestId: string,
    assistantAction:
      | 'analyze_sentiment'
      | 'summarize_conversation'
      | 'suggest_reply'
      | 'generate_pitch',
    metadata: Record<string, unknown>,
    estimatedCostCents?: bigint,
  ): Promise<boolean> {
    if (!workspaceId) {
      return false;
    }

    try {
      await this.prepaidWalletService.chargeForUsage({
        workspaceId,
        operation: 'ai_message',
        ...(estimatedCostCents !== undefined
          ? { quotedCostCents: estimatedCostCents }
          : { units: 1 }),
        requestId,
        metadata: {
          channel: 'ai_assistant',
          capability: assistantAction,
          ...metadata,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof UsagePriceNotFoundError) {
        return false;
      }

      if (error instanceof InsufficientWalletBalanceError || error instanceof WalletNotFoundError) {
        throw new AgentAssistWalletAccessError(this.insufficientWalletMessage());
      }

      throw error;
    }
  }

  private async executeAiOperation<T>(
    workspaceId: string | undefined,
    requestId: string,
    operation: 'analyze_sentiment' | 'summarize_conversation' | 'suggest_reply' | 'generate_pitch',
    model: string,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    handler: (completion: OpenAI.Chat.ChatCompletion) => T,
    estimatedCostCents?: bigint,
  ): Promise<T> {
    const usageCharged = await this.chargeAiUsageIfNeeded(
      workspaceId,
      requestId,
      operation,
      { model },
      estimatedCostCents,
    );
    try {
      await this.ensureBudget(workspaceId);
      const completion = await chatCompletionWithRetry(this.openai, { model, messages });
      if (estimatedCostCents !== undefined && usageCharged) {
        await this.settleAiUsageIfNeeded(
          workspaceId,
          requestId,
          operation,
          model,
          completion?.usage,
        );
      }
      await this.trackUsage(workspaceId, completion?.usage?.total_tokens);
      return handler(completion);
    } catch (error) {
      if (!(error instanceof AgentAssistWalletAccessError)) {
        await this.refundAiUsageIfNeeded(
          workspaceId,
          requestId,
          operation,
          'ai_assistant_provider_exception',
        );
      }
      throw error;
    }
  }

  private estimateOpenAiQuote(model: string, messages: unknown): bigint | undefined {
    try {
      return estimateOpenAiChatQuoteCostCents({ model, messages });
    } catch (error) {
      if (error instanceof UnknownProviderPricingModelError) {
        return undefined;
      }
      throw error;
    }
  }

  private async settleAiUsageIfNeeded(
    workspaceId: string | undefined | null,
    requestId: string,
    assistantAction:
      | 'analyze_sentiment'
      | 'summarize_conversation'
      | 'suggest_reply'
      | 'generate_pitch',
    model: string,
    usage: unknown,
  ) {
    if (!workspaceId) {
      return;
    }

    try {
      await this.prepaidWalletService.settleUsageCharge({
        workspaceId,
        operation: 'ai_message',
        requestId,
        actualCostCents: quoteOpenAiChatActualCostCents({
          model,
          usage: usage as {
            prompt_tokens?: number | null;
            completion_tokens?: number | null;
            prompt_tokens_details?: { cached_tokens?: number | null } | null;
          },
        }),
        reason: 'ai_assistant_provider_usage',
        metadata: {
          channel: 'ai_assistant',
          capability: assistantAction,
          model,
        },
      });
    } catch (error) {
      if (!(error instanceof UnknownProviderPricingModelError)) {
        throw error;
      }
    }
  }

  private async refundAiUsageIfNeeded(
    workspaceId: string | undefined | null,
    requestId: string,
    assistantAction:
      | 'analyze_sentiment'
      | 'summarize_conversation'
      | 'suggest_reply'
      | 'generate_pitch',
    reason: string,
  ) {
    if (!workspaceId) {
      return;
    }

    await this.prepaidWalletService.refundUsageCharge({
      workspaceId,
      operation: 'ai_message',
      requestId,
      reason,
      metadata: {
        channel: 'ai_assistant',
        capability: assistantAction,
      },
    });
  }

  /** Analyze sentiment. */
  async analyzeSentiment(text: string, workspaceId?: string, requestId: string = randomUUID()) {
    if (!this.openai) {
      return { sentiment: 'neutral', score: 0 };
    }
    const model = resolveBackendOpenAIModel('brain');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'Classifique sentimento em positivo, neutro ou negativo.',
      },
      { role: 'user', content: text || '' },
    ];
    const estimatedCostCents = this.estimateOpenAiQuote(model, messages);
    return this.executeAiOperation(
      workspaceId,
      requestId,
      'analyze_sentiment',
      model,
      messages,
      (completion) => {
        const content = completion.choices[0]?.message?.content?.toLowerCase() || '';
        const sentiment = content.includes('positivo')
          ? 'positive'
          : content.includes('negativo')
            ? 'negative'
            : 'neutral';
        return { sentiment, raw: content };
      },
      estimatedCostCents,
    );
  }

  /** Summarize conversation. */
  async summarizeConversation(
    conversationId: string,
    workspaceId?: string,
    requestId: string = randomUUID(),
  ) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 30 },
      },
    });
    if (!convo) {
      return { summary: '' };
    }
    const effectiveWorkspaceId =
      this.readWorkspaceId(workspaceId) || this.readWorkspaceId(convo.workspaceId);

    const history = convo.messages.map((m) => `[${m.direction}] ${m.content}`).join('\n');

    if (!this.openai) {
      return { summary: history.slice(0, 200) };
    }

    const model = resolveBackendOpenAIModel('brain');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Resuma em 3 linhas, português.' },
      { role: 'user', content: history },
    ];
    const estimatedCostCents = this.estimateOpenAiQuote(model, messages);
    return this.executeAiOperation(
      effectiveWorkspaceId,
      requestId,
      'summarize_conversation',
      model,
      messages,
      (completion) => ({ summary: completion.choices[0]?.message?.content || '' }),
      estimatedCostCents,
    );
  }

  /** Suggest reply. */
  async suggestReply(
    workspaceId: string,
    conversationId: string,
    prompt?: string,
    requestId: string = randomUUID(),
  ) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    const latest = convo?.messages?.[0]?.content || '';
    if (!this.openai) {
      return { suggestion: prompt ? `${prompt} ${latest}` : latest };
    }
    const model = resolveBackendOpenAIModel('writer');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Responda curto e direto, tom humano.' },
      {
        role: 'user',
        content: prompt ? `${prompt}\nContexto: ${latest}` : latest,
      },
    ];
    const estimatedCostCents = this.estimateOpenAiQuote(model, messages);
    const usageCharged = await this.chargeAiUsageIfNeeded(
      workspaceId,
      requestId,
      'suggest_reply',
      {
        conversationId,
        latestLength: latest.length,
        hasPrompt: Boolean(prompt),
        model,
        billingRail: estimatedCostCents !== undefined ? 'provider_quote' : 'catalog_fallback',
      },
      estimatedCostCents,
    );
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(this.openai, {
        model,
        messages,
      });
      if (estimatedCostCents !== undefined && usageCharged) {
        await this.settleAiUsageIfNeeded(
          workspaceId,
          requestId,
          'suggest_reply',
          model,
          completion?.usage,
        );
      }
      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
      return { suggestion: completion.choices[0]?.message?.content || latest };
    } catch (error) {
      if (!(error instanceof AgentAssistWalletAccessError)) {
        await this.refundAiUsageIfNeeded(
          workspaceId,
          requestId,
          'suggest_reply',
          'ai_assistant_provider_exception',
        );
      }
      throw error;
    }
  }

  /** Generate pitch. */
  async generatePitch(
    conversationId: string,
    workspaceId: string,
    requestId: string = randomUUID(),
  ) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
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
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'Crie um pitch curto, persuasivo, português BR, CTA claro.',
      },
      { role: 'user', content: base },
    ];
    const estimatedCostCents = this.estimateOpenAiQuote(model, messages);
    const usageCharged = await this.chargeAiUsageIfNeeded(
      workspaceId,
      requestId,
      'generate_pitch',
      {
        conversationId,
        contextLength: context.length,
        model,
        billingRail: estimatedCostCents !== undefined ? 'provider_quote' : 'catalog_fallback',
      },
      estimatedCostCents,
    );
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(this.openai, {
        model,
        messages,
      });
      if (estimatedCostCents !== undefined && usageCharged) {
        await this.settleAiUsageIfNeeded(
          workspaceId,
          requestId,
          'generate_pitch',
          model,
          completion?.usage,
        );
      }
      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
      return { pitch: completion.choices[0]?.message?.content || base };
    } catch (error) {
      if (!(error instanceof AgentAssistWalletAccessError)) {
        await this.refundAiUsageIfNeeded(
          workspaceId,
          requestId,
          'generate_pitch',
          'ai_assistant_provider_exception',
        );
      }
      throw error;
    }
  }
}
