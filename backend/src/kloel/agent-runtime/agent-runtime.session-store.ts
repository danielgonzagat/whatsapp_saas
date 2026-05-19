import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
import {
  PROVENANCE_WEIGHT,
  SEARCH_CATEGORIES,
  agentRuntimeSessionGroupKey,
  buildAgentRuntimeSourceStamp,
  buildAgentRuntimeTurnContent,
  computeFreshnessDecay,
  computeSourceConfidence,
  extractAgentRuntimeMatchWindow,
  extractAgentRuntimeSnippet,
  finalizeAgentRuntimeSessionRecallGroup,
  mapCategoryToProvenance,
  tokenizeAgentRuntimeQuery,
  ttlForCategory,
} from './agent-runtime.session-store.search';
import type {
  AgentRuntimeRecallResult,
  AgentRuntimeSessionRecallGroup,
  AgentRuntimeSessionRecallResult,
  AgentRuntimeTurnRecord,
} from './agent-runtime.types';

@Injectable()
export class AgentRuntimeSessionStore {
  private readonly logger = StructuredLogger.from(AgentRuntimeSessionStore.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async recordTurn(turn: AgentRuntimeTurnRecord): Promise<string | null> {
    const id = randomUUID();
    const content = buildAgentRuntimeTurnContent(turn);
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
      void this.opsAlert?.alertOnCriticalError(
        error,
        'AgentRuntimeSessionStore.recordRuntimeEvent',
      );
      this.logger.warn(`Failed to record agent runtime event: ${this.messageFor(error)}`);
      return null;
    }
  }

  async search(workspaceId: string, query: string, limit = 6): Promise<AgentRuntimeRecallResult> {
    const normalizedQuery = sanitizeAgentRuntimeText(query, 500).trim();
    if (!workspaceId || !normalizedQuery) {
      return { query: normalizedQuery, tokens: [], totalFound: 0, memories: [] };
    }

    const tokens = tokenizeAgentRuntimeQuery(normalizedQuery);
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
        category: { in: [...SEARCH_CATEGORIES] },
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
        createdAt: true,
        updatedAt: true,
      },
    });

    const scored = rows
      .map((row) => {
        const matchable = `${row.key ?? ''} ${row.content ?? ''}`.toLowerCase();
        const matchCount = tokens.filter((t) => matchable.includes(t.toLowerCase())).length;
        const provenance = mapCategoryToProvenance(row.category);
        const ageMs = Date.now() - row.createdAt.getTime();
        const ttlMs = ttlForCategory(row.category);
        const freshnessDecay = computeFreshnessDecay(ageMs, ttlMs);
        const provenanceWeight = PROVENANCE_WEIGHT[provenance];
        const confidence = computeSourceConfidence(
          matchCount,
          tokens.length,
          provenanceWeight,
          freshnessDecay,
        );
        const score = matchCount * 10 + freshnessDecay * 5 + provenanceWeight * 3;
        return { row, score, matchCount, confidence, provenance, ttlMs, ageMs, freshnessDecay };
      })
      .filter((entry) => entry.matchCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);

    return {
      query: normalizedQuery,
      tokens,
      totalFound: scored.length,
      memories: scored.map(
        ({ row, matchCount, confidence, provenance, ttlMs, ageMs, freshnessDecay }) => ({
          id: row.id,
          key: row.key,
          category: row.category,
          content: row.content ?? '',
          value: row.value,
          snippet: extractAgentRuntimeSnippet(row.content ?? '', tokens),
          source: buildAgentRuntimeSourceStamp(
            row,
            matchCount,
            provenance,
            ttlMs,
            ageMs,
            freshnessDecay,
            confidence,
          ),
        }),
      ),
    };
  }

  async searchSessions(
    workspaceId: string,
    query: string,
    limit = 3,
  ): Promise<AgentRuntimeSessionRecallResult> {
    const normalizedQuery = sanitizeAgentRuntimeText(query, 500).trim();
    if (!workspaceId || !normalizedQuery) {
      return { query: normalizedQuery, tokens: [], totalFound: 0, sessions: [] };
    }

    const tokens = tokenizeAgentRuntimeQuery(normalizedQuery);
    if (tokens.length === 0) {
      return { query: normalizedQuery, tokens, totalFound: 0, sessions: [] };
    }

    const safeLimit = Math.max(1, Math.min(limit, 8));
    const fetchLimit = safeLimit * 16;
    const orConditions = tokens.flatMap((token) => [
      { content: { contains: token, mode: 'insensitive' as const } },
      { key: { contains: token, mode: 'insensitive' as const } },
    ]);

    const rows = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        category: { in: [...SEARCH_CATEGORIES] },
        OR: orConditions,
      },
      orderBy: { updatedAt: 'desc' },
      take: fetchLimit,
      select: {
        id: true,
        key: true,
        category: true,
        content: true,
        metadata: true,
        updatedAt: true,
      },
    });

    const groups = new Map<string, AgentRuntimeSessionRecallGroup>();
    for (const row of rows) {
      const matchable = `${row.key ?? ''} ${row.content ?? ''}`.toLowerCase();
      const matchCount = tokens.filter((token) => matchable.includes(token.toLowerCase())).length;
      if (matchCount === 0) {
        continue;
      }

      const groupKey = agentRuntimeSessionGroupKey(row.metadata, row.key);
      const existing = groups.get(groupKey.id);
      const message = {
        id: row.id,
        key: row.key,
        category: row.category,
        content: row.content ?? '',
        snippet: extractAgentRuntimeMatchWindow(row.content ?? '', normalizedQuery, tokens, 360),
        updatedAt: row.updatedAt.toISOString(),
      };

      if (existing) {
        existing.matchCount += matchCount;
        existing.messages.push(message);
        if (row.updatedAt.toISOString() > existing.updatedAt) {
          existing.updatedAt = row.updatedAt.toISOString();
        }
      } else {
        groups.set(groupKey.id, {
          sessionId: groupKey.id,
          source: groupKey.source,
          matchCount,
          updatedAt: row.updatedAt.toISOString(),
          summary: '',
          transcriptWindow: '',
          messages: [message],
        });
      }
    }

    const sessions = [...groups.values()]
      .map((group) => finalizeAgentRuntimeSessionRecallGroup(group, normalizedQuery, tokens))
      .sort((a, b) => b.matchCount - a.matchCount || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, safeLimit);

    return {
      query: normalizedQuery,
      tokens,
      totalFound: sessions.length,
      sessions,
    };
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
