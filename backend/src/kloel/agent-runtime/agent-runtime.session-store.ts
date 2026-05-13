import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
import type {
  AgentRuntimeHygieneState,
  AgentRuntimeRecallResult,
  AgentRuntimeSessionRecallGroup,
  AgentRuntimeSessionRecallResult,
  AgentRuntimeSourceProvenance,
  AgentRuntimeSourceStamp,
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
      void this.opsAlert?.alertOnCriticalError(
        error,
        'AgentRuntimeSessionStore.recordRuntimeEvent',
      );
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

  private static readonly TTL_BY_CATEGORY: Record<string, number> = {
    agent_curated: 365 * 24 * 60 * 60 * 1000,
    agent_skill: 180 * 24 * 60 * 60 * 1000,
    agent_event: 90 * 24 * 60 * 60 * 1000,
    product: 30 * 24 * 60 * 60 * 1000,
    objection: 60 * 24 * 60 * 60 * 1000,
    compressed_context: 30 * 24 * 60 * 60 * 1000,
  };

  private static readonly DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  private static readonly PROVENANCE_WEIGHT: Record<AgentRuntimeSourceProvenance, number> = {
    agent_curated: 1.0,
    agent_skill: 0.92,
    compressed_context: 0.85,
    agent_event: 0.78,
    product: 0.65,
    objection: 0.65,
    kloel_memory: 0.5,
  };

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
        createdAt: true,
        updatedAt: true,
      },
    });

    const scored = rows
      .map((row) => {
        const matchable = `${row.key ?? ''} ${row.content ?? ''}`.toLowerCase();
        const matchCount = tokens.filter((t) => matchable.includes(t.toLowerCase())).length;
        const provenance = this.mapCategoryToProvenance(row.category);
        const ageMs = Date.now() - row.createdAt.getTime();
        const ttlMs = this.ttlForCategory(row.category);
        const freshnessDecay = this.computeFreshnessDecay(ageMs, ttlMs);
        const provenanceWeight = AgentRuntimeSessionStore.PROVENANCE_WEIGHT[provenance];
        const confidence = this.computeSourceConfidence(
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
          snippet: this.extractSnippet(row.content ?? '', tokens),
          source: this.buildSourceStamp(
            row,
            matchCount,
            tokens.length,
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

    const tokens = this.tokenize(normalizedQuery);
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

      const groupKey = this.sessionGroupKey(row.metadata, row.key);
      const existing = groups.get(groupKey.id);
      const message = {
        id: row.id,
        key: row.key,
        category: row.category,
        content: row.content ?? '',
        snippet: this.extractMatchWindow(row.content ?? '', normalizedQuery, tokens, 360),
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
      .map((group) => this.finalizeSessionRecallGroup(group, normalizedQuery, tokens))
      .sort((a, b) => b.matchCount - a.matchCount || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, safeLimit);

    return {
      query: normalizedQuery,
      tokens,
      totalFound: sessions.length,
      sessions,
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

  private extractMatchWindow(
    content: string,
    query: string,
    tokens: string[],
    maxChars: number,
  ): string {
    if (!content || content.length <= maxChars) {
      return content;
    }
    const lower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    const positions: number[] = [];
    let phraseIndex = lower.indexOf(queryLower);
    while (phraseIndex !== -1) {
      positions.push(phraseIndex);
      phraseIndex = lower.indexOf(queryLower, phraseIndex + queryLower.length);
    }
    if (positions.length === 0 && tokens.length > 1) {
      const termPositions = tokens.map((token) => ({
        token,
        positions: this.matchPositions(lower, token.toLowerCase()),
      }));
      const rarest = [...termPositions].sort((a, b) => a.positions.length - b.positions.length)[0];
      for (const position of rarest?.positions ?? []) {
        if (
          termPositions.every((entry) =>
            entry.positions.some((candidate) => Math.abs(candidate - position) < 200),
          )
        ) {
          positions.push(position);
        }
      }
    }
    if (positions.length === 0) {
      for (const token of tokens) {
        positions.push(...this.matchPositions(lower, token.toLowerCase()));
      }
    }
    if (positions.length === 0) {
      return `${content.slice(0, maxChars)}…`;
    }

    positions.sort((a, b) => a - b);
    let bestStart = 0;
    let bestCount = 0;
    for (const position of positions) {
      const start = Math.max(0, position - Math.floor(maxChars / 4));
      const end = Math.min(content.length, start + maxChars);
      const covered = positions.filter((candidate) => candidate >= start && candidate < end).length;
      if (covered > bestCount) {
        bestCount = covered;
        bestStart = Math.max(0, Math.min(start, content.length - maxChars));
      }
    }
    const end = Math.min(content.length, bestStart + maxChars);
    return `${bestStart > 0 ? '…' : ''}${content.slice(bestStart, end)}${
      end < content.length ? '…' : ''
    }`;
  }

  private matchPositions(contentLower: string, tokenLower: string): number[] {
    const positions: number[] = [];
    let index = contentLower.indexOf(tokenLower);
    while (index !== -1) {
      positions.push(index);
      index = contentLower.indexOf(tokenLower, index + tokenLower.length);
    }
    return positions;
  }

  private sessionGroupKey(
    metadata: Prisma.JsonValue | null,
    key: string,
  ): { id: string; source: AgentRuntimeSessionRecallGroup['source'] } {
    const record = this.asRecord(metadata);
    const threadId = this.asString(record.threadId);
    if (threadId) {
      return { id: threadId, source: 'thread' };
    }
    const sessionId = this.asString(record.sessionId);
    if (sessionId) {
      return { id: sessionId, source: 'session' };
    }
    const contactId = this.asString(record.contactId);
    if (contactId) {
      return { id: contactId, source: 'contact' };
    }
    return { id: key, source: 'memory' };
  }

  private finalizeSessionRecallGroup(
    group: AgentRuntimeSessionRecallGroup,
    query: string,
    tokens: string[],
  ): AgentRuntimeSessionRecallGroup {
    const orderedMessages = [...group.messages]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);
    const transcript = orderedMessages
      .map((message) => `[${message.category}] ${message.snippet || message.content}`)
      .join('\n\n');
    const transcriptWindow = this.extractMatchWindow(transcript, query, tokens, 2000);
    return {
      ...group,
      messages: orderedMessages,
      transcriptWindow,
      summary: sanitizeAgentRuntimeText(
        `session=${group.sessionId}; source=${group.source}; matches=${group.matchCount}; latest=${group.updatedAt}; focus=${query}; evidence=${transcriptWindow}`,
        2400,
      ),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private mapCategoryToProvenance(category: string): AgentRuntimeSourceProvenance {
    const mapping: Record<string, AgentRuntimeSourceProvenance> = {
      agent_event: 'agent_event',
      agent_skill: 'agent_skill',
      agent_curated: 'agent_curated',
      product: 'product',
      objection: 'objection',
    };
    return mapping[category] ?? 'kloel_memory';
  }

  private ttlForCategory(category: string): number {
    return (
      AgentRuntimeSessionStore.TTL_BY_CATEGORY[category] ?? AgentRuntimeSessionStore.DEFAULT_TTL_MS
    );
  }

  private computeFreshnessDecay(ageMs: number, ttlMs: number): number {
    if (ttlMs <= 0) {
      return 1;
    }
    const ratio = Math.min(1, ageMs / ttlMs);
    return 1 - Math.pow(ratio, 0.45);
  }

  private computeSourceConfidence(
    matched: number,
    total: number,
    provenanceWeight: number,
    freshnessDecay: number,
  ): number {
    if (total === 0) {
      return 0;
    }
    const matchRatio = matched / total;
    const baseConfidence =
      matchRatio >= 1 ? 0.92 : matchRatio >= 0.66 ? 0.78 : matchRatio >= 0.33 ? 0.55 : 0.35;
    const weighted = baseConfidence * 0.45 + provenanceWeight * 0.35 + freshnessDecay * 0.2;
    return Math.round(weighted * 100) / 100;
  }

  private computeRetentionScore(
    provenanceWeight: number,
    freshnessDecay: number,
    matchCount: number,
  ): number {
    const score = provenanceWeight * 0.4 + freshnessDecay * 0.35 + Math.min(matchCount, 5) * 0.05;
    return Math.round(score * 100) / 100;
  }

  private computeHygieneState(ageMs: number, ttlMs: number): AgentRuntimeHygieneState {
    if (ttlMs <= 0) {
      return 'fresh';
    }
    const ratio = ageMs / ttlMs;
    if (ratio < 0.3) {
      return 'fresh';
    }
    if (ratio < 0.6) {
      return 'aging';
    }
    if (ratio < 0.9) {
      return 'stale';
    }
    if (ratio < 1.0) {
      return 'expired';
    }
    return 'retired';
  }

  private buildSourceStamp(
    row: { category: string; createdAt: Date },
    matchCount: number,
    _totalTokens: number,
    provenance: AgentRuntimeSourceProvenance,
    ttlMs: number,
    ageMs: number,
    freshnessDecay: number,
    confidence: number,
  ): AgentRuntimeSourceStamp {
    const hygieneState = this.computeHygieneState(ageMs, ttlMs);
    const freshnessLabel =
      hygieneState === 'fresh' ? 'fresh' : hygieneState === 'aging' ? 'fresh' : 'stale';
    const retentionScore = this.computeRetentionScore(
      AgentRuntimeSessionStore.PROVENANCE_WEIGHT[provenance],
      freshnessDecay,
      matchCount,
    );
    return {
      source: provenance,
      confidence,
      freshness: freshnessLabel,
      truthMode: 'observed',
      observedAt: row.createdAt.toISOString(),
      provenance,
      ttlMs,
      expiresAt: new Date(row.createdAt.getTime() + ttlMs).toISOString(),
      retentionScore,
    };
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
