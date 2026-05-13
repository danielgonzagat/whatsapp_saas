import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
import type { AgentRuntimeRecallResult, AgentRuntimeTurnRecord } from './agent-runtime.types';

@Injectable()
export class AgentRuntimeSessionStore {
  private readonly logger = StructuredLogger.from(AgentRuntimeSessionStore.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async recordTurn(turn: AgentRuntimeTurnRecord): Promise<string | null> {
    const id = randomUUID();
    const content = this.buildTurnContent(turn);
    const key = `agent_turn:${turn.channel}:${id}`;
    try {
      const metadata = {
        kind: 'agent_turn',
        channel: turn.channel,
        contactId: turn.contactId ?? null,
        threadId: turn.threadId ?? null,
        userId: turn.userId ?? null,
        intent: turn.intent ?? null,
        confidence: turn.confidence ?? null,
        actions: toInputJsonValue(turn.actions ?? []),
      } satisfies Prisma.InputJsonObject;

      await this.prisma.kloelMemory.create({
        data: {
          workspaceId: turn.workspaceId,
          key,
          category: 'agent_event',
          type: 'turn',
          content,
          value: toInputJsonValue({
            userMessage: sanitizeAgentRuntimeText(turn.userMessage, 8000),
            assistantMessage: sanitizeAgentRuntimeText(turn.assistantMessage ?? '', 8000),
          }),
          metadata,
        },
      });
      return key;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeSessionStore.recordTurn');
      this.logger.warn(`Failed to record agent runtime turn: ${this.messageFor(error)}`);
      return null;
    }
  }

  async recordRuntimeEvent(params: {
    workspaceId: string;
    eventType: string;
    sessionId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const id = randomUUID();
    const key = `agent_runtime:${params.eventType}:${params.sessionId}:${id}`;
    try {
      await this.prisma.kloelMemory.create({
        data: {
          workspaceId: params.workspaceId,
          key,
          category: 'agent_event',
          type: params.eventType,
          content: sanitizeAgentRuntimeText(params.content, 6000),
          value: toInputJsonValue({
            eventType: params.eventType,
            sessionId: params.sessionId,
          }),
          metadata: {
            kind: 'agent_runtime_event',
            eventType: sanitizeAgentRuntimeText(params.eventType, 120),
            sessionId: sanitizeAgentRuntimeText(params.sessionId, 160),
            ...(toInputJsonValue(params.metadata ?? {}) as Prisma.InputJsonObject),
          } satisfies Prisma.InputJsonObject,
        },
      });
      return key;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeSessionStore.recordRuntimeEvent');
      this.logger.warn(`Failed to record agent runtime event: ${this.messageFor(error)}`);
      return null;
    }
  }

  private static readonly SEARCH_CATEGORIES = [
    'agent_event',
    'agent_skill',
    'agent_curated',
    'product',
    'objection',
  ] as const;

  private static readonly SNIPPET_RADIUS = 120;

  async search(workspaceId: string, query: string, limit = 6): Promise<AgentRuntimeRecallResult> {
    const normalizedQuery = sanitizeAgentRuntimeText(query, 500).trim();
    if (!workspaceId || !normalizedQuery) {
      return { query: normalizedQuery, tokens: [], totalFound: 0, memories: [] };
    }

    const tokens = this.tokenize(normalizedQuery);
    if (tokens.length === 0) {
      return { query: normalizedQuery, tokens: [], totalFound: 0, memories: [] };
    }

    const safeLimit = Math.max(1, Math.min(limit, 20));
    const fetchLimit = safeLimit * 3;

    const orConditions = tokens.flatMap((token) => [
      { content: { contains: token, mode: 'insensitive' as const } },
      { key: { contains: token, mode: 'insensitive' as const } },
    ]);

    const rows = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        category: { in: [...AgentRuntimeSessionStore.SEARCH_CATEGORIES] },
        OR: orConditions,
      },
      orderBy: { updatedAt: 'desc' },
      take: fetchLimit,
      select: {
        id: true,
        key: true,
        category: true,
        content: true,
        value: true,
        updatedAt: true,
      },
    });

    const scored = rows
      .map((row) => {
        const matchable = `${row.key ?? ''} ${row.content ?? ''}`.toLowerCase();
        const matchCount = tokens.filter((t) => matchable.includes(t.toLowerCase())).length;
        const recencyHours = (Date.now() - row.updatedAt.getTime()) / (1000 * 60 * 60);
        const recencyBoost = Math.max(0, 1 - recencyHours / 720);
        const score = matchCount * 10 + recencyBoost;
        return { row, score, matchCount };
      })
      .filter((entry) => entry.matchCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);

    return {
      query: normalizedQuery,
      tokens,
      totalFound: scored.length,
      memories: scored.map(({ row, matchCount }) => ({
        id: row.id,
        key: row.key,
        category: row.category,
        content: row.content ?? '',
        value: row.value,
        snippet: this.extractSnippet(row.content ?? '', tokens),
        source: {
          source: 'kloel_memory',
          confidence: this.confidenceFromMatches(matchCount, tokens.length),
          freshness: this.freshnessFromDate(row.updatedAt),
          truthMode: 'observed',
          observedAt: row.updatedAt.toISOString(),
        },
      })),
    };
  }

  private tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9\u00C0-\u024F]/gi, ''))
      .filter((t) => t.length >= 2);
  }

  private extractSnippet(content: string, tokens: string[]): string {
    if (!content) {
      return '';
    }
    const lower = content.toLowerCase();
    let bestStart = 0;
    for (const token of tokens) {
      const idx = lower.indexOf(token.toLowerCase());
      if (idx !== -1) {
        const start = Math.max(0, idx - AgentRuntimeSessionStore.SNIPPET_RADIUS);
        if (bestStart === 0 || start < bestStart) {
          bestStart = start;
        }
      }
    }
    const end = Math.min(content.length, bestStart + AgentRuntimeSessionStore.SNIPPET_RADIUS * 2);
    let snippet = content.slice(bestStart, end);
    if (bestStart > 0) {
      snippet = `…${snippet}`;
    }
    if (end < content.length) {
      snippet = `${snippet}…`;
    }
    return snippet;
  }

  private confidenceFromMatches(matched: number, total: number): number {
    if (total === 0) {
      return 0;
    }
    const ratio = matched / total;
    if (ratio >= 1) {
      return 0.92;
    }
    if (ratio >= 0.66) {
      return 0.78;
    }
    if (ratio >= 0.33) {
      return 0.55;
    }
    return 0.35;
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

  private buildTurnContent(turn: AgentRuntimeTurnRecord): string {
    return [
      `channel=${sanitizeAgentRuntimeText(turn.channel, 80)}`,
      turn.contactId ? `contact=${sanitizeAgentRuntimeText(turn.contactId, 80)}` : '',
      turn.threadId ? `thread=${sanitizeAgentRuntimeText(turn.threadId, 80)}` : '',
      `user: ${sanitizeAgentRuntimeText(turn.userMessage, 2000)}`,
      turn.assistantMessage
        ? `assistant: ${sanitizeAgentRuntimeText(turn.assistantMessage, 2000)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
