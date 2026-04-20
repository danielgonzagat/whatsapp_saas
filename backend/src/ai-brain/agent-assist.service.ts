import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';

/** Agent assist service. */
@Injectable()
export class AgentAssistService {
  private openai: OpenAI | null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
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

  /** Analyze sentiment. */
  async analyzeSentiment(text: string, workspaceId?: string) {
    if (!this.openai) {
      return { sentiment: 'neutral', score: 0 };
    }
    await this.ensureBudget(workspaceId);
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain'),
      messages: [
        {
          role: 'system',
          content: 'Classifique sentimento em positivo, neutro ou negativo.',
        },
        { role: 'user', content: text || '' },
      ],
    });
    await this.trackUsage(workspaceId, completion?.usage?.total_tokens);
    const content = completion.choices[0]?.message?.content?.toLowerCase() || '';
    const sentiment = content.includes('positivo')
      ? 'positive'
      : content.includes('negativo')
        ? 'negative'
        : 'neutral';
    return { sentiment, raw: content };
  }

  /** Summarize conversation. */
  async summarizeConversation(conversationId: string, workspaceId?: string) {
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

    // tokenBudget: caller responsible for pre-flight budget check
    await this.ensureBudget(effectiveWorkspaceId);
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain'),
      messages: [
        { role: 'system', content: 'Resuma em 3 linhas, português.' },
        { role: 'user', content: history },
      ],
    });
    await this.trackUsage(effectiveWorkspaceId, completion?.usage?.total_tokens);
    return { summary: completion.choices[0]?.message?.content || '' };
  }

  /** Suggest reply. */
  async suggestReply(workspaceId: string, conversationId: string, prompt?: string) {
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
    await this.planLimits.ensureTokenBudget(workspaceId);
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('writer'),
      messages: [
        { role: 'system', content: 'Responda curto e direto, tom humano.' },
        {
          role: 'user',
          content: prompt ? `${prompt}\nContexto: ${latest}` : latest,
        },
      ],
    });
    await this.planLimits
      .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
      .catch(() => {});
    return { suggestion: completion.choices[0]?.message?.content || latest };
  }

  /** Generate pitch. */
  async generatePitch(conversationId: string, workspaceId: string) {
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
    await this.planLimits.ensureTokenBudget(workspaceId);
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain'),
      messages: [
        {
          role: 'system',
          content: 'Crie um pitch curto, persuasivo, português BR, CTA claro.',
        },
        { role: 'user', content: base },
      ],
    });
    await this.planLimits
      .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
      .catch(() => {});
    return { pitch: completion.choices[0]?.message?.content || base };
  }
}
