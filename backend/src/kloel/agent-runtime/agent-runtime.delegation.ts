import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
export type AgentDelegationStatus =
  | 'pending'
  | 'accepted'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';
export interface AgentDelegationInput {
  workspaceId: string;
  parentSessionId: string;
  task: string;
  toolScope: string[];
  childSessionId?: string;
  metadata?: Record<string, unknown>;
}
export interface AgentDelegationRecord {
  id: string;
  workspaceId: string;
  parentSessionId: string;
  childSessionId: string | null;
  task: string;
  toolScope: string[];
  status: AgentDelegationStatus;
  resultSummary: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
export interface AgentDelegationListResult {
  delegations: AgentDelegationRecord[];
  total: number;
}
const VALID_STATUSES: ReadonlySet<AgentDelegationStatus> = new Set([
  'pending',
  'accepted',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
const TERMINAL_STATUSES: ReadonlySet<AgentDelegationStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);
interface InnerDelegationValue {
  kind: 'agent_delegation';
  parentSessionId: string;
  childSessionId: string | null;
  task: string;
  toolScope: string[];
  status: AgentDelegationStatus;
  resultSummary: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
@Injectable()
export class AgentRuntimeDelegationService {
  private readonly logger = new Logger(AgentRuntimeDelegationService.name);
  constructor(private readonly prisma: PrismaService) {}
  async create(input: AgentDelegationInput): Promise<AgentDelegationRecord> {
    const id = randomUUID();
    const key = this.delegationKey(id);
    const now = new Date().toISOString();
    const value: InnerDelegationValue = {
      kind: 'agent_delegation',
      parentSessionId: input.parentSessionId,
      childSessionId: input.childSessionId ?? null,
      task: sanitizeAgentRuntimeText(input.task, 4000),
      toolScope: input.toolScope.filter((t) => typeof t === 'string' && t.length > 0),
      status: input.childSessionId ? 'accepted' : 'pending',
      resultSummary: null,
      error: null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    const created = await this.prisma.kloelMemory.create({
      data: {
        workspaceId: input.workspaceId,
        key,
        category: 'agent_delegation',
        type: 'delegation',
        value: toInputJsonValue(value),
        content: `${value.status}: ${value.task}`,
        metadata: {
          kind: 'agent_delegation',
          parentSessionId: value.parentSessionId,
          childSessionId: value.childSessionId,
          status: value.status,
        },
      },
    });
    return this.rowToRecord(created);
  }
  async accept(params: {
    workspaceId: string;
    parentSessionId: string;
    childSessionId: string;
  }): Promise<AgentDelegationRecord | null> {
    const row = await this.findPendingByParent(params.workspaceId, params.parentSessionId);
    if (!row) {
      this.logger.warn(
        `No pending delegation for parent ${params.parentSessionId} in workspace ${params.workspaceId}`,
      );
      return null;
    }
    const value = this.parseValue(row.value);
    if (!value) {
      return null;
    }
    const updated = await this.applyValue(row.workspaceId, row.key, {
      ...value,
      childSessionId: params.childSessionId,
      status: 'accepted',
      updatedAt: new Date().toISOString(),
    });
    if (!updated) {
      return null;
    }
    return this.rowToRecord(updated);
  }
  async transitionToRunning(params: {
    workspaceId: string;
    childSessionId: string;
  }): Promise<AgentDelegationRecord | null> {
    const row = await this.findByChildSession(params.workspaceId, params.childSessionId);
    if (!row) {
      return null;
    }
    const value = this.parseValue(row.value);
    if (!value || value.status !== 'accepted') {
      return null;
    }
    const updated = await this.applyValue(row.workspaceId, row.key, {
      ...value,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });
    if (!updated) {
      return null;
    }
    return this.rowToRecord(updated);
  }
  async completeWithSummary(params: {
    workspaceId: string;
    childSessionId: string;
    resultSummary: string;
    metadata?: Record<string, unknown>;
  }): Promise<AgentDelegationRecord | null> {
    const extra: {
      status: 'completed';
      resultSummary: string;
      metadata?: Record<string, unknown>;
    } = {
      status: 'completed',
      resultSummary: sanitizeAgentRuntimeText(params.resultSummary, 8000),
    };
    if (params.metadata !== undefined) {
      extra.metadata = params.metadata;
    }
    return this.finish(params.workspaceId, params.childSessionId, extra);
  }
  async markFailed(params: {
    workspaceId: string;
    childSessionId: string;
    error: string;
  }): Promise<AgentDelegationRecord | null> {
    return this.finish(params.workspaceId, params.childSessionId, {
      status: 'failed',
      error: sanitizeAgentRuntimeText(params.error, 2000),
    });
  }
  async cancel(params: {
    workspaceId: string;
    parentSessionId: string;
  }): Promise<AgentDelegationRecord | null> {
    const row = await this.findPendingByParent(params.workspaceId, params.parentSessionId);
    if (!row) {
      return null;
    }
    const value = this.parseValue(row.value);
    if (!value) {
      return null;
    }
    const updated = await this.applyValue(row.workspaceId, row.key, {
      ...value,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    if (!updated) {
      return null;
    }
    return this.rowToRecord(updated);
  }
  async getById(params: {
    workspaceId: string;
    delegationId: string;
  }): Promise<AgentDelegationRecord | null> {
    const key = this.delegationKey(params.delegationId);
    const row = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId: params.workspaceId, key } },
    });
    if (!row) {
      return null;
    }
    return this.rowToRecord(row);
  }
  async listByParentSession(params: {
    workspaceId: string;
    parentSessionId: string;
    status?: AgentDelegationStatus;
    limit?: number;
  }): Promise<AgentDelegationListResult> {
    const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId: params.workspaceId, category: 'agent_delegation', type: 'delegation' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const records = rows
      .map((row) => this.rowToRecord(row))
      .filter((r) => r.parentSessionId === params.parentSessionId)
      .filter((r) => !params.status || r.status === params.status)
      .slice(0, limit);
    return { delegations: records, total: records.length };
  }
  async listByChildSession(params: {
    workspaceId: string;
    childSessionId: string;
  }): Promise<AgentDelegationListResult> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId: params.workspaceId, category: 'agent_delegation', type: 'delegation' },
      orderBy: { updatedAt: 'desc' },
    });
    const records = rows
      .map((row) => this.rowToRecord(row))
      .filter((r) => r.childSessionId === params.childSessionId);
    return { delegations: records, total: records.length };
  }
  private async findPendingByParent(
    workspaceId: string,
    parentSessionId: string,
  ): Promise<{
    workspaceId: string;
    key: string;
    value: unknown;
  } | null> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'agent_delegation', type: 'delegation' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    for (const row of rows) {
      const value = this.parseValue(row.value);
      if (
        value &&
        value.parentSessionId === parentSessionId &&
        (value.status === 'pending' || value.status === 'accepted')
      ) {
        return { workspaceId: row.workspaceId, key: row.key, value: row.value };
      }
    }
    return null;
  }
  private async findByChildSession(
    workspaceId: string,
    childSessionId: string,
  ): Promise<{
    workspaceId: string;
    key: string;
    value: unknown;
  } | null> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'agent_delegation', type: 'delegation' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    for (const row of rows) {
      const value = this.parseValue(row.value);
      if (value && value.childSessionId === childSessionId) {
        return { workspaceId: row.workspaceId, key: row.key, value: row.value };
      }
    }
    return null;
  }
  private async finish(
    workspaceId: string,
    childSessionId: string,
    extra: {
      status: 'completed' | 'failed';
      resultSummary?: string;
      error?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<AgentDelegationRecord | null> {
    const row = await this.findByChildSession(workspaceId, childSessionId);
    if (!row) {
      return null;
    }
    const value = this.parseValue(row.value);
    if (!value || TERMINAL_STATUSES.has(value.status)) {
      return null;
    }
    const now = new Date().toISOString();
    const updated = await this.applyValue(row.workspaceId, row.key, {
      ...value,
      status: extra.status,
      resultSummary: extra.resultSummary ?? value.resultSummary,
      error: extra.error ?? null,
      metadata: extra.metadata ? { ...(value.metadata ?? {}), ...extra.metadata } : value.metadata,
      updatedAt: now,
      completedAt: now,
    });
    if (!updated) {
      return null;
    }
    return this.rowToRecord(updated);
  }
  private async applyValue(
    workspaceId: string,
    key: string,
    value: InnerDelegationValue,
  ): Promise<{ workspaceId: string; key: string; value: unknown } | null> {
    try {
      await this.prisma.kloelMemory.updateMany({
        where: {
          workspaceId,
          key,
          category: 'agent_delegation',
          type: 'delegation',
        },
        data: {
          value: toInputJsonValue(value),
          content: `${value.status}: ${value.task}`,
          metadata: {
            kind: 'agent_delegation',
            parentSessionId: value.parentSessionId,
            childSessionId: value.childSessionId,
            status: value.status,
          },
        },
      });
      return { workspaceId, key, value };
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to update delegation ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
  private rowToRecord(row: {
    workspaceId: string;
    key: string;
    value: unknown;
  }): AgentDelegationRecord {
    const value = this.parseValue(row.value);
    const id = row.key.startsWith('agent_delegation:')
      ? row.key.slice('agent_delegation:'.length)
      : row.key;
    return {
      id,
      workspaceId: row.workspaceId,
      parentSessionId: value?.parentSessionId ?? '',
      childSessionId: value?.childSessionId ?? null,
      task: value?.task ?? '',
      toolScope: value?.toolScope ?? [],
      status: value?.status ?? 'pending',
      resultSummary: value?.resultSummary ?? null,
      error: value?.error ?? null,
      metadata: value?.metadata ?? null,
      createdAt: value?.createdAt ?? '',
      updatedAt: value?.updatedAt ?? value?.createdAt ?? '',
      completedAt: value?.completedAt ?? null,
    };
  }
  private parseValue(raw: unknown): InnerDelegationValue | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const v = raw as Record<string, unknown>;
    if (v.kind !== 'agent_delegation') {
      return null;
    }
    const status = this.normalizeStatus(v.status);
    return {
      kind: 'agent_delegation',
      parentSessionId: typeof v.parentSessionId === 'string' ? v.parentSessionId : '',
      childSessionId: typeof v.childSessionId === 'string' ? v.childSessionId : null,
      task: typeof v.task === 'string' ? v.task : '',
      toolScope: Array.isArray(v.toolScope)
        ? v.toolScope.filter((t): t is string => typeof t === 'string')
        : [],
      status,
      resultSummary: typeof v.resultSummary === 'string' ? v.resultSummary : null,
      error: typeof v.error === 'string' ? v.error : null,
      metadata:
        v.metadata && typeof v.metadata === 'object' && !Array.isArray(v.metadata)
          ? (v.metadata as Record<string, unknown>)
          : null,
      createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
      updatedAt:
        typeof v.updatedAt === 'string'
          ? v.updatedAt
          : typeof v.createdAt === 'string'
            ? v.createdAt
            : '',
      completedAt: typeof v.completedAt === 'string' ? v.completedAt : null,
    };
  }
  private normalizeStatus(raw: unknown): AgentDelegationStatus {
    if (typeof raw === 'string' && VALID_STATUSES.has(raw as AgentDelegationStatus)) {
      return raw as AgentDelegationStatus;
    }
    return 'pending';
  }
  private delegationKey(id: string): string {
    const sanitized = sanitizeAgentRuntimeText(id, 160);
    return sanitized.startsWith('agent_delegation:') ? sanitized : `agent_delegation:${sanitized}`;
  }
}
