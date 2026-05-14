import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
import type {
  AgentRuntimeHygieneResult,
  AgentRuntimeHygieneState,
  AgentRuntimeTurnRecord,
} from './agent-runtime.types';

@Injectable()
export class AgentRuntimeMemoryCuratorService {
  private readonly logger = StructuredLogger.from(AgentRuntimeMemoryCuratorService.name);

  private static readonly TTL_BY_KIND: Record<string, number> = {
    action_failure: 120 * 24 * 60 * 60 * 1000,
    unresolved_operational_context: 90 * 24 * 60 * 60 * 1000,
  };

  private static readonly DEFAULT_CURATED_TTL_MS = 180 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async curateTurnOutcome(turn: AgentRuntimeTurnRecord): Promise<string | null> {
    const insight = this.deriveInsight(turn);
    if (!insight) {
      return null;
    }
    const fingerprint = this.fingerprint([
      turn.workspaceId,
      turn.threadId ?? turn.contactId ?? turn.channel,
      insight.kind,
      insight.content,
    ]);
    const key = `agent_curated_turn:${fingerprint}`;
    const confidence = this.insightConfidence(insight.kind, turn);
    const ttlMs =
      AgentRuntimeMemoryCuratorService.TTL_BY_KIND[insight.kind] ??
      AgentRuntimeMemoryCuratorService.DEFAULT_CURATED_TTL_MS;
    const retentionScore = this.computeCuratedRetentionScore(insight.kind, confidence);
    try {
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId: turn.workspaceId, key } },
        update: {
          category: 'agent_curated',
          type: insight.kind,
          content: insight.content,
          value: toInputJsonValue({ ...insight, confidence, retentionScore }),
          metadata: this.metadataFor(turn, insight.kind, confidence, ttlMs, retentionScore),
        },
        create: {
          workspaceId: turn.workspaceId,
          key,
          category: 'agent_curated',
          type: insight.kind,
          content: insight.content,
          value: toInputJsonValue({ ...insight, confidence, retentionScore }),
          metadata: this.metadataFor(turn, insight.kind, confidence, ttlMs, retentionScore),
        },
      });
      return key;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'AgentRuntimeMemoryCuratorService.curateTurnOutcome',
      );
      this.logger.warn(`Failed to curate agent runtime turn: ${this.messageFor(error)}`);
      return null;
    }
  }

  private deriveInsight(turn: AgentRuntimeTurnRecord): { kind: string; content: string } | null {
    const failedActions = (turn.actions ?? []).filter((action) => action.success === false);
    if (failedActions.length > 0) {
      return {
        kind: 'action_failure',
        content: sanitizeAgentRuntimeText(
          [
            `channel=${turn.channel}`,
            turn.threadId ? `thread=${turn.threadId}` : '',
            turn.contactId ? `contact=${turn.contactId}` : '',
            `failedTools=${failedActions.map((action) => action.toolName).join(', ')}`,
            `user=${turn.userMessage}`,
            turn.assistantMessage ? `assistant=${turn.assistantMessage}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          3000,
        ),
      };
    }

    const assistant = turn.assistantMessage ?? '';
    const combined = `${turn.userMessage}\n${assistant}`.toLowerCase();
    if (this.looksOperationallyUnresolved(combined)) {
      return {
        kind: 'unresolved_operational_context',
        content: sanitizeAgentRuntimeText(
          [
            `channel=${turn.channel}`,
            turn.threadId ? `thread=${turn.threadId}` : '',
            turn.contactId ? `contact=${turn.contactId}` : '',
            `user=${turn.userMessage}`,
            assistant ? `assistant=${assistant}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          3000,
        ),
      };
    }

    return null;
  }

  private looksOperationallyUnresolved(value: string): boolean {
    return (
      value.includes('pending') ||
      value.includes('unresolved') ||
      value.includes('blocked') ||
      value.includes('falhou') ||
      value.includes('bloqueado') ||
      value.includes('pendente') ||
      value.includes('falta evidencia') ||
      value.includes('falta evidência')
    );
  }

  private metadataFor(
    turn: AgentRuntimeTurnRecord,
    kind: string,
    confidence: number,
    ttlMs: number,
    retentionScore: number,
  ): Prisma.InputJsonObject {
    return {
      kind: 'agent_curated_turn',
      insightKind: kind,
      channel: sanitizeAgentRuntimeText(turn.channel, 120),
      threadId: turn.threadId ? sanitizeAgentRuntimeText(turn.threadId, 160) : null,
      contactId: turn.contactId ? sanitizeAgentRuntimeText(turn.contactId, 160) : null,
      intent: turn.intent ? sanitizeAgentRuntimeText(turn.intent, 160) : null,
      curatedConfidence:
        typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0,
      ttlMs: typeof ttlMs === 'number' && Number.isFinite(ttlMs) ? ttlMs : null,
      retentionScore:
        typeof retentionScore === 'number' && Number.isFinite(retentionScore) ? retentionScore : 0,
    };
  }

  private insightConfidence(kind: string, turn: AgentRuntimeTurnRecord): number {
    const baseConfidence = kind === 'action_failure' ? 0.92 : 0.78;
    const assistant = turn.assistantMessage ?? '';
    const signalLength = (turn.userMessage + assistant).length;
    const signalBoost = Math.min(0.1, signalLength / 8000);
    const confidence = Math.min(1, baseConfidence + signalBoost);
    return Math.round(confidence * 100) / 100;
  }

  private computeCuratedRetentionScore(kind: string, confidence: number): number {
    const kindWeight = kind === 'action_failure' ? 0.9 : 0.7;
    const score = kindWeight * 0.5 + confidence * 0.5;
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

  async cleanupStaleMemories(
    workspaceId: string,
    options?: { minRetentionScore?: number; maxItems?: number },
  ): Promise<AgentRuntimeHygieneResult> {
    const minRetention = options?.minRetentionScore ?? 0.3;
    const maxItems = Math.min(options?.maxItems ?? 500, 1000);
    const now = new Date();
    const result: AgentRuntimeHygieneResult = {
      workspaceId,
      inspected: 0,
      expired: 0,
      retained: 0,
      staleKeys: [],
      errors: 0,
      completedAt: now.toISOString(),
    };

    try {
      const rows = await this.prisma.kloelMemory.findMany({
        where: {
          workspaceId,
          category: 'agent_curated',
        },
        select: {
          id: true,
          key: true,
          createdAt: true,
          metadata: true,
        },
        orderBy: { createdAt: 'asc' },
        take: maxItems,
      });

      result.inspected = rows.length;

      for (const row of rows) {
        try {
          const record = this.asRecord(row.metadata);
          const ttlMs =
            typeof record.ttlMs === 'number'
              ? record.ttlMs
              : AgentRuntimeMemoryCuratorService.DEFAULT_CURATED_TTL_MS;
          const retentionScore =
            typeof record.retentionScore === 'number' ? record.retentionScore : 0.5;

          const ageMs = now.getTime() - row.createdAt.getTime();
          const hygieneState = this.computeHygieneState(ageMs, ttlMs);

          if (hygieneState === 'retired' && retentionScore < minRetention) {
            await this.prisma.kloelMemory.update({
              where: { id: row.id },
              data: {
                category: 'agent_curated',
                metadata: {
                  ...record,
                  hygieneState,
                  retiredAt: now.toISOString(),
                  retentionScore,
                },
              },
            });
            result.expired += 1;
            result.staleKeys.push(row.key);
          } else if (hygieneState === 'expired') {
            await this.prisma.kloelMemory.update({
              where: { id: row.id },
              data: {
                metadata: {
                  ...record,
                  hygieneState,
                  scannedAt: now.toISOString(),
                },
              },
            });
            result.staleKeys.push(row.key);
          } else {
            result.retained += 1;
          }
        } catch {
          result.errors += 1;
        }
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'AgentRuntimeMemoryCuratorService.cleanupStaleMemories',
      );
      this.logger.warn(`Failed to cleanup stale curated memories: ${this.messageFor(error)}`);
      result.errors += 1;
    }

    return result;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private fingerprint(parts: string[]): string {
    return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24);
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
