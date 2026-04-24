import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import { type KloelStreamEvent } from './kloel-stream-events';
import { KloelThreadSummaryService } from './kloel-thread-summary.service';
import OpenAI from 'openai';

const WHITESPACE_G_RE = /\s+/g;
const TRAILING_DOTS_RE = /[.]+$/;
const SEPARATOR_G_RE = /[_-]+/g;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ThreadConversationState {
  summary?: string;
  recentMessages: ChatMessage[];
  totalMessages: number;
}

export interface StoredProcessingTraceEntry {
  id: string;
  kind: 'status' | 'tool_call' | 'tool_result';
  phase: 'thinking' | 'tool_calling' | 'tool_result' | 'streaming';
  label: string;
  createdAt: string;
  tool?: string;
  success?: boolean;
}

export interface StoredResponseVersion {
  id: string;
  content: string;
  createdAt: string;
  source: 'initial' | 'regenerated';
}

/** Manages chat thread persistence, conversation state. Summary/title logic delegated to KloelThreadSummaryService. */
@Injectable()
export class KloelThreadService {
  private readonly logger = new Logger(KloelThreadService.name);
  readonly recentThreadMessageLimit = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly summaryService: KloelThreadSummaryService,
  ) {}

  async resolveThread(
    workspaceId: string,
    conversationId?: string,
  ): Promise<{
    id: string;
    title: string;
    summary: string | null;
    summaryUpdatedAt: Date | null;
  } | null> {
    if (!workspaceId) return null;

    if (conversationId) {
      const existing = await this.prisma.chatThread.findFirst({
        where: { id: conversationId, workspaceId },
        select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
      });
      if (existing) return existing;
    }

    return this.prisma.chatThread.create({
      data: { workspaceId, title: 'Nova conversa' },
      select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
    });
  }

  async getThreadConversationHistory(
    threadId: string,
    workspaceId?: string,
    limit = this.recentThreadMessageLimit,
  ): Promise<ChatMessage[]> {
    if (!threadId) return [];

    const messages = await this.prisma.chatMessage.findMany({
      where: workspaceId ? { threadId, thread: { workspaceId } } : { threadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });

    return messages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  async getThreadConversationState(
    threadId?: string | null,
    workspaceId?: string | null,
  ): Promise<ThreadConversationState> {
    if (!threadId || !workspaceId) {
      return { recentMessages: [], totalMessages: 0 };
    }

    const findThread = this.prisma.chatThread.findFirst({
      where: { id: threadId, workspaceId },
      select: { summary: true, summaryUpdatedAt: true },
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

    const [thread, totalMessages, recentMessages] = await Promise.all([
      findThread,
      countMessages,
      this.getThreadConversationHistory(threadId, workspaceId, this.recentThreadMessageLimit),
    ]);

    return {
      summary:
        thread?.summary && String(thread.summary).trim().length > 0
          ? String(thread.summary)
          : undefined,
      recentMessages,
      totalMessages,
    };
  }

  normalizeThreadMessageMetadataRecord(
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
  ): Record<string, unknown> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    return { ...(metadata as Record<string, unknown>) };
  }

  buildThreadMessageMetadata(
    baseMetadata?: Prisma.InputJsonValue,
    extraFields?: Record<string, unknown>,
  ): Prisma.InputJsonValue | undefined {
    const normalizedBase = this.normalizeThreadMessageMetadataRecord(baseMetadata);
    const normalizedExtra = Object.fromEntries(
      Object.entries(extraFields || {}).filter(([, v]) => v !== undefined),
    );
    const merged = { ...normalizedBase, ...normalizedExtra };
    return Object.keys(merged).length > 0 ? (merged as Prisma.InputJsonValue) : undefined;
  }

  touchThread(threadId: string, workspaceId: string) {
    if (typeof this.prisma.chatThread.updateMany === 'function') {
      return this.prisma.chatThread.updateMany({
        where: { id: threadId, workspaceId },
        data: { updatedAt: new Date() },
      });
    }
    return this.prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
  }

  async persistUserThreadMessage(
    threadId: string,
    workspaceId: string,
    userMessage: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<{ id: string } | null> {
    if (!threadId) return null;
    const created = await this.prisma.chatMessage.create({
      data: { threadId, role: 'user', content: userMessage, metadata },
      select: { id: true },
    });
    await this.touchThread(threadId, workspaceId);
    return created;
  }

  async persistAssistantThreadMessage(
    threadId: string,
    workspaceId: string,
    assistantMessage: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<{ id: string } | null> {
    if (!threadId) return null;
    const created = await this.prisma.chatMessage.create({
      data: { threadId, role: 'assistant', content: assistantMessage, metadata },
      select: { id: true },
    });
    await this.touchThread(threadId, workspaceId);
    return created;
  }

  buildStoredResponseVersions(
    metadata: Prisma.InputJsonValue | Prisma.JsonValue | null | undefined,
    fallbackContent?: string,
    fallbackVersionId?: string,
  ): StoredResponseVersion[] {
    const normalized = this.normalizeThreadMessageMetadataRecord(metadata);
    const versions = Array.isArray(normalized.responseVersions)
      ? normalized.responseVersions
          .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
            const candidate = entry as Record<string, unknown>;
            const content = typeof candidate.content === 'string' ? candidate.content : '';
            if (!content.trim()) return null;
            const createdAt =
              typeof candidate.createdAt === 'string' && candidate.createdAt.trim()
                ? candidate.createdAt
                : new Date().toISOString();
            const source = candidate.source === 'regenerated' ? 'regenerated' : 'initial';
            const id =
              typeof candidate.id === 'string' && candidate.id.trim()
                ? candidate.id
                : `resp_${createdAt}`;
            return { id, content, createdAt, source } satisfies StoredResponseVersion;
          })
          .filter((e): e is StoredResponseVersion => !!e)
      : [];

    if (versions.length > 0) return versions;
    const normalizedFallback = String(fallbackContent || '');
    if (!normalizedFallback.trim()) return [];
    return [
      {
        id: fallbackVersionId || `resp_${Date.now()}`,
        content: normalizedFallback,
        createdAt: new Date().toISOString(),
        source: 'initial',
      },
    ];
  }

  buildStoredProcessingTraceEntry(event: KloelStreamEvent): StoredProcessingTraceEntry | null {
    if (event.type === 'status') {
      const phase = event.phase === 'streaming_token' ? 'streaming' : event.phase;
      const label = String(event.message || '').trim();
      if (!label) return null;
      return {
        id: buildTimestampedRuntimeId(`trace_${phase}`),
        kind: 'status',
        phase,
        label,
        createdAt: new Date().toISOString(),
      };
    }
    if (event.type === 'tool_call') {
      return {
        id: event.callId || buildTimestampedRuntimeId('trace_tool_call'),
        kind: 'tool_call',
        phase: 'tool_calling',
        label: `Executando ${this.formatTraceToolLabel(event.tool)}.`,
        createdAt: new Date().toISOString(),
        tool: event.tool,
      };
    }
    if (event.type === 'tool_result') {
      return {
        id: event.callId || buildTimestampedRuntimeId('trace_tool_result'),
        kind: 'tool_result',
        phase: 'tool_result',
        label: event.success
          ? `Concluiu ${this.formatTraceToolLabel(event.tool)}.`
          : `Falhou ao executar ${this.formatTraceToolLabel(event.tool)}.`,
        createdAt: new Date().toISOString(),
        tool: event.tool,
        success: event.success,
      };
    }
    return null;
  }

  appendStoredProcessingTraceEntry(entries: StoredProcessingTraceEntry[], event: KloelStreamEvent) {
    const nextEntry = this.buildStoredProcessingTraceEntry(event);
    if (!nextEntry) return;
    const prev = entries[entries.length - 1];
    if (
      prev &&
      prev.phase === nextEntry.phase &&
      prev.label === nextEntry.label &&
      prev.kind === nextEntry.kind
    ) {
      return;
    }
    entries.push(nextEntry);
    if (entries.length > 16) entries.splice(0, entries.length - 16);
  }

  buildProcessingTraceSummary(entries: StoredProcessingTraceEntry[]): string | undefined {
    const labels = Array.from(
      new Set(
        entries
          .map((e) =>
            String(e.label || '')
              .replace(WHITESPACE_G_RE, ' ')
              .trim()
              .replace(TRAILING_DOTS_RE, ''),
          )
          .filter(Boolean),
      ),
    );
    if (labels.length === 0) return undefined;
    if (labels.length === 1) return `${labels[0]}.`;
    if (labels.length === 2) return `${labels[0]} e ${this.lowercaseLeadingCharacter(labels[1])}.`;
    return `${labels[0]}, ${this.lowercaseLeadingCharacter(labels[1])} e ${this.lowercaseLeadingCharacter(labels[labels.length - 1])}.`;
  }

  private lowercaseLeadingCharacter(value: string): string {
    if (!value) return value;
    return value.charAt(0).toLowerCase() + value.slice(1);
  }

  formatTraceToolLabel(toolName?: string | null): string {
    const raw = String(toolName || 'ferramenta')
      .trim()
      .replace(SEPARATOR_G_RE, ' ')
      .replace(WHITESPACE_G_RE, ' ');
    if (!raw) return 'a ferramenta';
    return raw
      .split(' ')
      .map((s) => s.toLowerCase())
      .join(' ');
  }

  buildThreadSummarySystemMessage(
    summary?: string,
  ): import('openai/resources/chat').ChatCompletionMessageParam | null {
    const normalized = String(summary || '').trim();
    if (!normalized) return null;
    return {
      role: 'system',
      content: `<conversation_memory>\nResumo persistido da conversa até aqui:\n${normalized}\nUse isso para manter continuidade sem repetir perguntas já respondidas.\n</conversation_memory>`,
    };
  }

  resolveClientRequestId(metadata?: Prisma.InputJsonValue): string | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const raw = (metadata as Record<string, unknown>).clientRequestId;
    const id = typeof raw === 'string' ? raw.trim() : '';
    return id || undefined;
  }

  // ── Delegation to KloelThreadSummaryService ──

  async maybeGenerateThreadTitle(
    threadId: string,
    currentTitle: string,
    firstUserMessage: string,
    workspaceId: string,
    openai?: OpenAI,
  ): Promise<string> {
    return this.summaryService.maybeGenerateThreadTitle(
      threadId,
      currentTitle,
      firstUserMessage,
      workspaceId,
      openai,
    );
  }

  async maybeRefreshThreadSummary(
    threadId?: string | null,
    workspaceId?: string,
    openai?: OpenAI,
  ): Promise<void> {
    return this.summaryService.maybeRefreshThreadSummary(threadId, workspaceId, openai);
  }
}
