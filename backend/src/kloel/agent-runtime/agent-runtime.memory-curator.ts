import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
import type { AgentRuntimeTurnRecord } from './agent-runtime.types';

@Injectable()
export class AgentRuntimeMemoryCuratorService {
  private readonly logger = StructuredLogger.from(AgentRuntimeMemoryCuratorService.name);

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
    try {
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId: turn.workspaceId, key } },
        update: {
          category: 'agent_curated',
          type: insight.kind,
          content: insight.content,
          value: toInputJsonValue(insight),
          metadata: this.metadataFor(turn, insight.kind),
        },
        create: {
          workspaceId: turn.workspaceId,
          key,
          category: 'agent_curated',
          type: insight.kind,
          content: insight.content,
          value: toInputJsonValue(insight),
          metadata: this.metadataFor(turn, insight.kind),
        },
      });
      return key;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeMemoryCuratorService.curateTurnOutcome');
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

  private metadataFor(turn: AgentRuntimeTurnRecord, kind: string): Prisma.InputJsonObject {
    return {
      kind: 'agent_curated_turn',
      insightKind: kind,
      channel: sanitizeAgentRuntimeText(turn.channel, 120),
      threadId: turn.threadId ? sanitizeAgentRuntimeText(turn.threadId, 160) : null,
      contactId: turn.contactId ? sanitizeAgentRuntimeText(turn.contactId, 160) : null,
      intent: turn.intent ? sanitizeAgentRuntimeText(turn.intent, 160) : null,
    };
  }

  private fingerprint(parts: string[]): string {
    return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24);
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
