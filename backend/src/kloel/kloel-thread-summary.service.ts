import { Injectable, Logger } from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { chatCompletionWithFallback } from './openai-wrapper';
import OpenAI from 'openai';

const WHITESPACE_G_RE = /\s+/g;
const QUOTE_TRIM_RE = /^["'""'']+|["'""'']+$/g;
const TRAILING_PUNCT_G_RE = /[.!?]+$/g;
const NEWLINE_RE = /\n/;
const WHITESPACE_RE = /\s+/;
const _COMO_ESTRATEGIA_F_RE =
  /[?]|como|estrat[eé]gia|funil|plano|relat[oó]rio|documento|vender|marketing|autom[aá]tica|copy|webhook|api|integra[cç][aã]o|whatsapp/i;

/** Handles AI-powered thread title generation and conversation summarization. */
@Injectable()
export class KloelThreadSummaryService {
  private readonly logger = new Logger(KloelThreadSummaryService.name);
  private readonly recentThreadMessageLimit = 20;
  private readonly threadSummaryRefreshEvery = 6;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private buildFallbackThreadTitle(message: string): string {
    const cleaned = String(message || '')
      .replace(WHITESPACE_G_RE, ' ')
      .trim();
    if (!cleaned) return 'Nova conversa';
    const words = cleaned.split(' ').slice(0, 5);
    const title = words.join(' ').slice(0, 60).trim();
    if (!title) return 'Nova conversa';
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  sanitizeGeneratedThreadTitle(value: string | null | undefined): string {
    const sanitized = String(value || '')
      .replace(QUOTE_TRIM_RE, '')
      .replace(TRAILING_PUNCT_G_RE, '')
      .replace(WHITESPACE_G_RE, ' ')
      .trim()
      .slice(0, 60);
    return sanitized || 'Nova conversa';
  }

  isDefaultThreadTitle(title?: string | null): boolean {
    const normalized = String(title || '')
      .trim()
      .toLowerCase();
    return !normalized || normalized === 'nova conversa';
  }

  isSubstantiveMessage(message: string): boolean {
    const normalized = String(message || '').trim();
    if (!normalized) return false;
    if (normalized.length >= 40) return true;
    if (NEWLINE_RE.test(normalized)) return true;
    if (normalized.split(WHITESPACE_RE).length >= 8) return true;
    return _COMO_ESTRATEGIA_F_RE.test(normalized);
  }

  async generateConversationTitle(
    message: string,
    workspaceId?: string,
    openai?: OpenAI,
  ): Promise<string> {
    const fallbackTitle = this.buildFallbackThreadTitle(message);
    if (!openai || (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
      return fallbackTitle;
    }
    try {
      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
      const response = await chatCompletionWithFallback(
        openai,
        {
          model: resolveBackendOpenAIModel('writer'),
          messages: [
            {
              role: 'system',
              content:
                'Crie um título curto para uma conversa. Regras: máximo 5 palavras, sem aspas, sem pontuação final, em português e objetivo.',
            },
            { role: 'user', content: `Mensagem inicial da conversa:\n${message}` },
          ],
          temperature: 0.2,
          max_tokens: 24,
        },
        resolveBackendOpenAIModel('writer_fallback'),
      );
      if (workspaceId) {
        await this.planLimits
          .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 64)
          .catch(() => {});
      }
      return this.sanitizeGeneratedThreadTitle(response.choices[0]?.message?.content);
    } catch (error) {
      this.logger.warn(`Falha ao gerar título da conversa: ${String(error)}`);
      return fallbackTitle;
    }
  }

  async maybeGenerateThreadTitle(
    threadId: string,
    currentTitle: string,
    firstUserMessage: string,
    workspaceId: string,
    openai?: OpenAI,
  ): Promise<string> {
    if (!this.isDefaultThreadTitle(currentTitle)) return currentTitle;
    if (!this.isSubstantiveMessage(firstUserMessage)) return currentTitle;
    const title = await this.generateConversationTitle(firstUserMessage, workspaceId, openai);
    await this.prisma.chatThread.updateMany({
      where: { id: threadId, workspaceId },
      data: { title, updatedAt: new Date() },
    });
    return title;
  }

  async maybeRefreshThreadSummary(
    threadId?: string | null,
    workspaceId?: string,
    openai?: OpenAI,
  ): Promise<void> {
    if (!threadId || !workspaceId) return;

    const findThread = this.prisma.chatThread.findFirst({
      where: { id: threadId, workspaceId },
      select: { id: true, summary: true, summaryUpdatedAt: true },
    });
    const countMessages =
      typeof this.prisma.chatMessage.count === 'function'
        ? this.prisma.chatMessage.count({ where: { threadId, thread: { workspaceId } } })
        : (async () => {
            const rows = await this.prisma.chatMessage.findMany({
              where: { threadId, thread: { workspaceId } },
              take: 10_000,
              select: { id: true },
            });
            return rows.length;
          })();

    const [thread, totalMessages] = await Promise.all([findThread, countMessages]);
    if (!thread || totalMessages <= this.recentThreadMessageLimit) return;

    const olderCount = totalMessages - this.recentThreadMessageLimit;
    const shouldRefresh =
      !thread.summary ||
      olderCount % this.threadSummaryRefreshEvery === 0 ||
      !thread.summaryUpdatedAt;
    if (!shouldRefresh) return;

    const olderMessages = await this.prisma.chatMessage.findMany({
      where: { threadId, thread: { workspaceId } },
      orderBy: { createdAt: 'asc' },
      take: olderCount,
      select: { role: true, content: true },
    });
    if (!olderMessages.length) return;

    const transcript = olderMessages
      .map((e) => `${e.role === 'user' ? 'Usuário' : 'Kloel'}: ${String(e.content || '').trim()}`)
      .filter(Boolean)
      .join('\n');

    const fallbackSummary = transcript.slice(-2200);
    let summary = fallbackSummary;

    if (openai && process.env.OPENAI_API_KEY) {
      try {
        await this.planLimits.ensureTokenBudget(workspaceId);
        const response = await chatCompletionWithFallback(
          openai,
          {
            model: resolveBackendOpenAIModel('writer'),
            messages: [
              {
                role: 'system',
                content:
                  'Resuma a conversa em um único bloco curto, em português brasileiro, preservando fatos, preferências, objeções, decisões, itens prometidos e próximos passos. Não invente nada.',
              },
              { role: 'user', content: `Conversa para resumir:\n${transcript}` },
            ],
            temperature: 0.2,
            top_p: 0.95,
            max_tokens: 320,
          },
          resolveBackendOpenAIModel('writer_fallback'),
        );
        await this.planLimits
          .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 120)
          .catch(() => {});
        summary =
          String(response.choices[0]?.message?.content || fallbackSummary).trim() ||
          fallbackSummary;
      } catch (error) {
        this.logger.warn(`Falha ao atualizar resumo da thread ${threadId}: ${String(error)}`); // Intencional: thread summary update is best-effort.
      }
    }

    await this.prisma.chatThread.updateMany({
      where: { id: threadId, workspaceId },
      data: { summary, summaryUpdatedAt: new Date() },
    });
  }
}
