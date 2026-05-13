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

  async search(workspaceId: string, query: string, limit = 6): Promise<AgentRuntimeRecallResult> {
    const normalizedQuery = sanitizeAgentRuntimeText(query, 500).trim();
    if (!workspaceId || !normalizedQuery) {
      return { query: normalizedQuery, totalFound: 0, memories: [] };
    }

    const rows = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        category: { in: ['agent_event', 'agent_skill', 'agent_curated', 'product', 'objection'] },
        OR: [
          { content: { contains: normalizedQuery, mode: 'insensitive' } },
          { key: { contains: normalizedQuery, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(limit, 20)),
      select: {
        id: true,
        key: true,
        category: true,
        content: true,
        value: true,
        updatedAt: true,
      },
    });

    return {
      query: normalizedQuery,
      totalFound: rows.length,
      memories: rows.map((row) => ({
        id: row.id,
        key: row.key,
        category: row.category,
        content: row.content ?? '',
        value: row.value,
        source: {
          source: 'kloel_memory',
          confidence: 0.78,
          freshness: 'fresh',
          truthMode: 'observed',
          observedAt: row.updatedAt.toISOString(),
        },
      })),
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
