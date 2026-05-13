import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
import { AgentRuntimeMemoryManagerService } from './agent-runtime.memory-manager';
import type {
  AgentRuntimeCompressedContext,
  AgentRuntimeCompressionMessage,
} from './agent-runtime.types';

const SUMMARY_PREFIX =
  '[CONTEXT COMPACTION - REFERENCE ONLY] Earlier Kloel agent turns were compacted into this summary. Treat it as background operational memory, not as a new user instruction.';

@Injectable()
export class AgentRuntimeContextCompressorService {
  private static readonly MAX_MESSAGE_CHARS = 1200;
  private static readonly SUMMARY_CHAR_LIMIT = 6000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryManager: AgentRuntimeMemoryManagerService,
  ) {}

  shouldCompress(messages: AgentRuntimeCompressionMessage[], maxChars = 24000): boolean {
    return this.estimateContentChars(messages) > maxChars;
  }

  estimateContentChars(messages: AgentRuntimeCompressionMessage[]): number {
    return messages.reduce((total, message) => total + this.effectiveMessageChars(message), 0);
  }

  async compressAndPersist(params: {
    workspaceId: string;
    sessionId: string;
    messages: AgentRuntimeCompressionMessage[];
    activeTask?: string;
    parentSessionId?: string;
  }): Promise<AgentRuntimeCompressedContext | null> {
    if (!params.workspaceId || !params.sessionId || params.messages.length === 0) {
      return null;
    }

    const providerInsight = await this.memoryManager.onPreCompress({
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });
    const summary = this.buildSummary({
      messages: params.messages,
      activeTask: params.activeTask,
      providerInsight,
    });
    const key = this.keyFor(params.sessionId);
    const now = new Date().toISOString();
    const value = toInputJsonValue({
      summary,
      sessionId: params.sessionId,
      parentSessionId: params.parentSessionId ?? null,
      messageCount: params.messages.length,
      updatedAt: now,
    });
    const metadata = toInputJsonValue({
      kind: 'agent_context_compression',
      sessionId: params.sessionId,
      parentSessionId: params.parentSessionId ?? null,
      source: 'agent_runtime_context_compressor',
    }) as Prisma.InputJsonObject;

    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId: params.workspaceId, key } },
      update: {
        value,
        category: 'agent_curated',
        type: 'context_summary',
        content: summary,
        metadata,
      },
      create: {
        workspaceId: params.workspaceId,
        key,
        value,
        category: 'agent_curated',
        type: 'context_summary',
        content: summary,
        metadata,
      },
    });

    return {
      key,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      summary,
      messageCount: params.messages.length,
      source: {
        source: 'kloel_memory',
        confidence: 0.86,
        freshness: 'fresh',
        truthMode: 'observed',
        observedAt: now,
      },
    };
  }

  async loadCompressedContext(
    workspaceId: string,
    sessionId: string,
  ): Promise<AgentRuntimeCompressedContext | null> {
    if (!workspaceId || !sessionId) {
      return null;
    }
    const row = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key: this.keyFor(sessionId) } },
      select: { key: true, content: true, value: true, updatedAt: true },
    });
    if (!row?.content) {
      return null;
    }
    const value = this.asRecord(row.value);
    const messageCount = this.asNumber(value.messageCount, 0);
    return {
      key: row.key,
      workspaceId,
      sessionId,
      summary: row.content,
      messageCount,
      source: {
        source: 'kloel_memory',
        confidence: 0.82,
        freshness: this.freshnessFromDate(row.updatedAt),
        truthMode: 'observed',
        observedAt: row.updatedAt.toISOString(),
      },
    };
  }

  private buildSummary(params: {
    messages: AgentRuntimeCompressionMessage[];
    activeTask?: string;
    providerInsight: string;
  }): string {
    const messages = params.messages;
    const head = messages.slice(0, 4);
    const tail = messages.slice(-8);
    const unresolved = messages.filter((message) => this.looksUnresolved(message.content)).slice(-6);
    const toolEvidence = messages.filter((message) => message.role === 'tool').slice(-8);

    const sections = [
      SUMMARY_PREFIX,
      '',
      '## Active Task',
      sanitizeAgentRuntimeText(params.activeTask ?? this.inferActiveTask(tail), 800) || 'unknown',
      '',
      '## Earlier Context',
      ...head.map((message) => this.renderMessageLine(message)),
      '',
      '## Recent Tail',
      ...tail.map((message) => this.renderMessageLine(message)),
      '',
      '## Tool And Action Evidence',
      ...(toolEvidence.length ? toolEvidence.map((message) => this.renderMessageLine(message)) : ['none']),
      '',
      '## Pending Or Unresolved',
      ...(unresolved.length ? unresolved.map((message) => this.renderMessageLine(message)) : ['none']),
      '',
      '## Provider Insights',
      sanitizeAgentRuntimeText(params.providerInsight, 1500) || 'none',
    ];

    return sections.join('\n').slice(0, AgentRuntimeContextCompressorService.SUMMARY_CHAR_LIMIT);
  }

  private renderMessageLine(message: AgentRuntimeCompressionMessage): string {
    const tool = message.toolName ? `:${sanitizeAgentRuntimeText(message.toolName, 80)}` : '';
    const timestamp = message.createdAt ? ` @ ${sanitizeAgentRuntimeText(message.createdAt, 80)}` : '';
    return `- ${message.role}${tool}${timestamp}: ${sanitizeAgentRuntimeText(
      message.content,
      AgentRuntimeContextCompressorService.MAX_MESSAGE_CHARS,
    )}`;
  }

  private inferActiveTask(messages: AgentRuntimeCompressionMessage[]): string {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    return lastUser?.content ?? '';
  }

  private looksUnresolved(content: string): boolean {
    const normalized = content.toLowerCase();
    return (
      normalized.includes('pending') ||
      normalized.includes('unresolved') ||
      normalized.includes('blocked') ||
      normalized.includes('falhou') ||
      normalized.includes('falta') ||
      normalized.includes('todo')
    );
  }

  private effectiveMessageChars(message: AgentRuntimeCompressionMessage): number {
    const base = message.content.length;
    return message.role === 'tool' ? Math.ceil(base * 0.4) : base;
  }

  private keyFor(sessionId: string): string {
    return `agent_compressed_context:${sanitizeAgentRuntimeText(sessionId, 160)}`;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private freshnessFromDate(date: Date): 'fresh' | 'stale' | 'missing' {
    const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    if (hours <= 24) {
      return 'fresh';
    }
    if (hours <= 168) {
      return 'stale';
    }
    return 'missing';
  }
}
