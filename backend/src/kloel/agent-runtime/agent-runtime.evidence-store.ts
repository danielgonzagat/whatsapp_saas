import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';

export type AgentEvidenceType =
  | 'tool_result'
  | 'runtime_observation'
  | 'validation'
  | 'pulse'
  | 'commercial_event'
  | 'manual';

export type AgentEvidenceVerificationState =
  | 'unverified'
  | 'single_source'
  | 'multi_source_verified';

export interface AgentEvidenceInput {
  workspaceId: string;
  source: string;
  content: string;
  type: AgentEvidenceType;
  actor?: string;
  url?: string;
  eventTimestamp?: string;
  verification?: AgentEvidenceVerificationState;
  notes?: string;
  metadata?: Record<string, unknown>;
  parentId?: string;
}

export interface AgentEvidenceRecord {
  id: string;
  workspaceId: string;
  key: string;
  type: AgentEvidenceType;
  source: string;
  content: string;
  contentSha256: string;
  actor: string | null;
  url: string | null;
  eventTimestamp: string | null;
  collectedAt: string;
  verification: AgentEvidenceVerificationState;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  parentId: string | null;
}

export interface AgentEvidenceIntegrityIssue {
  id: string;
  storedSha256: string;
  computedSha256: string;
}

interface EvidenceValue {
  kind: 'agent_evidence';
  id: string;
  type: AgentEvidenceType;
  source: string;
  content: string;
  contentSha256: string;
  actor: string | null;
  url: string | null;
  eventTimestamp: string | null;
  collectedAt: string;
  verification: AgentEvidenceVerificationState;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  parentId: string | null;
}

interface EvidenceRow {
  workspaceId: string;
  key: string;
  value: unknown;
  content: string | null;
}

@Injectable()
export class AgentRuntimeEvidenceStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async add(input: AgentEvidenceInput): Promise<AgentEvidenceRecord> {
    const id = `ev_${randomUUID()}`;
    const now = new Date().toISOString();
    const content = sanitizeAgentRuntimeText(input.content, 30_000);
    const parentId = input.parentId ? sanitizeAgentRuntimeText(input.parentId, 100) : null;
    const value: EvidenceValue = {
      kind: 'agent_evidence',
      id,
      type: this.evidenceType(input.type),
      source: sanitizeAgentRuntimeText(input.source, 500),
      content,
      contentSha256: this.sha256(content),
      actor: input.actor ? sanitizeAgentRuntimeText(input.actor, 200) : null,
      url: input.url ? sanitizeAgentRuntimeText(input.url, 1000) : null,
      eventTimestamp: input.eventTimestamp
        ? sanitizeAgentRuntimeText(input.eventTimestamp, 100)
        : null,
      collectedAt: now,
      verification: this.verification(input.verification),
      notes: input.notes ? sanitizeAgentRuntimeText(input.notes, 2000) : null,
      metadata: input.metadata ?? null,
      parentId,
    };

    const row = await this.prisma.kloelMemory.create({
      data: {
        workspaceId: input.workspaceId,
        key: this.evidenceKey(id),
        category: 'agent_evidence',
        type: value.type,
        content: `${value.source}\n${value.content}`,
        value: toInputJsonValue(value),
        metadata: {
          kind: 'agent_evidence',
          evidenceId: id,
          evidenceType: value.type,
          contentSha256: value.contentSha256,
          verification: value.verification,
          ...(value.parentId ? { parentId: value.parentId } : {}),
        },
      },
    });

    return this.rowToRecord(row);
  }

  async list(params: {
    workspaceId: string;
    type?: AgentEvidenceType;
    actor?: string;
    limit?: number;
  }): Promise<AgentEvidenceRecord[]> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId: params.workspaceId,
        category: 'agent_evidence',
        ...(params.type ? { type: this.evidenceType(params.type) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(params.limit ?? 50, 200)),
    });
    const actor = params.actor ? params.actor.toLowerCase() : '';
    return rows
      .map((row) => this.rowToRecord(row))
      .filter((record) => !actor || (record.actor ?? '').toLowerCase() === actor);
  }

  async query(params: {
    workspaceId: string;
    keyword: string;
    limit?: number;
  }): Promise<AgentEvidenceRecord[]> {
    const keyword = sanitizeAgentRuntimeText(params.keyword, 200).trim().toLowerCase();
    if (!keyword) {
      return [];
    }
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId: params.workspaceId, category: 'agent_evidence' },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min((params.limit ?? 50) * 4, 400)),
    });
    return rows
      .map((row) => this.rowToRecord(row))
      .filter(
        (record) =>
          record.content.toLowerCase().includes(keyword) ||
          record.source.toLowerCase().includes(keyword) ||
          (record.actor ?? '').toLowerCase().includes(keyword) ||
          (record.url ?? '').toLowerCase().includes(keyword),
      )
      .slice(0, Math.max(1, Math.min(params.limit ?? 20, 100)));
  }

  async verify(workspaceId: string): Promise<AgentEvidenceIntegrityIssue[]> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'agent_evidence' },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const issues: AgentEvidenceIntegrityIssue[] = [];
    for (const row of rows) {
      const record = this.rowToRecord(row);
      const computedSha256 = this.sha256(record.content);
      if (computedSha256 !== record.contentSha256) {
        issues.push({
          id: record.id,
          storedSha256: record.contentSha256,
          computedSha256,
        });
      }
    }
    return issues;
  }

  async summary(workspaceId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byVerification: Record<string, number>;
    uniqueActors: string[];
  }> {
    const evidence = await this.list({ workspaceId, limit: 200 });
    const byType: Record<string, number> = {};
    const byVerification: Record<string, number> = {};
    const actors = new Set<string>();
    for (const record of evidence) {
      byType[record.type] = (byType[record.type] ?? 0) + 1;
      byVerification[record.verification] = (byVerification[record.verification] ?? 0) + 1;
      if (record.actor) {
        actors.add(record.actor);
      }
    }
    return {
      total: evidence.length,
      byType,
      byVerification,
      uniqueActors: [...actors].sort(),
    };
  }

  async exportMarkdown(workspaceId: string, limit = 100): Promise<string> {
    const records = await this.list({ workspaceId, limit });
    if (records.length === 0) {
      return `# Agent Evidence Export\n\n**Workspace:** ${workspaceId}\n\n_No evidence records found._\n`;
    }
    const generatedAt = new Date().toISOString();
    const lines: string[] = [
      '# Agent Evidence Export',
      '',
      `**Workspace:** \`${workspaceId}\` | **Generated:** ${generatedAt}`,
      `**Records:** ${records.length}`,
      '',
    ];
    for (const record of records) {
      lines.push('---', '');
      lines.push(`## Evidence \`${record.id}\``);
      lines.push('');
      lines.push(`- **Type:** ${record.type}`);
      lines.push(`- **Source:** ${record.source}`);
      lines.push(`- **Actor:** ${record.actor ?? '_none_'}`);
      lines.push(`- **Verification:** ${record.verification}`);
      lines.push(`- **Collected:** ${record.collectedAt}`);
      if (record.eventTimestamp) {
        lines.push(`- **Event time:** ${record.eventTimestamp}`);
      }
      if (record.url) {
        lines.push(`- **URL:** ${record.url}`);
      }
      if (record.parentId) {
        lines.push(`- **Parent:** \`${record.parentId}\``);
      }
      lines.push(`- **SHA256:** \`${record.contentSha256}\``);
      if (record.notes) {
        lines.push(`- **Notes:** ${record.notes}`);
      }
      lines.push('', record.content, '');
    }
    return lines.join('\n');
  }

  async custody(workspaceId: string, evidenceId: string): Promise<AgentEvidenceRecord[]> {
    const chain: AgentEvidenceRecord[] = [];
    const seen = new Set<string>();
    let pointer: string | null = evidenceId;
    let iterations = 0;
    while (pointer && iterations < 100) {
      iterations += 1;
      if (seen.has(pointer)) {
        break;
      }
      seen.add(pointer);
      const record = await this.findById(workspaceId, pointer);
      if (!record) {
        break;
      }
      chain.push(record);
      pointer = record.parentId;
    }
    return chain;
  }

  private async findById(
    workspaceId: string,
    evidenceId: string,
  ): Promise<AgentEvidenceRecord | null> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        category: 'agent_evidence',
        key: this.evidenceKey(evidenceId),
      },
      take: 1,
    });
    if (rows.length === 0) {
      return null;
    }
    return this.rowToRecord(rows[0] as EvidenceRow);
  }

  private rowToRecord(row: EvidenceRow): AgentEvidenceRecord {
    const value = this.parseValue(row.value);
    const content = value?.content ?? sanitizeAgentRuntimeText(row.content ?? '', 30_000);
    return {
      id: value?.id ?? row.key.replace(/^agent_evidence:/, ''),
      workspaceId: row.workspaceId,
      key: row.key,
      type: this.evidenceType(value?.type),
      source: value?.source ?? 'unknown',
      content,
      contentSha256: value?.contentSha256 ?? this.sha256(content),
      actor: value?.actor ?? null,
      url: value?.url ?? null,
      eventTimestamp: value?.eventTimestamp ?? null,
      collectedAt: value?.collectedAt ?? new Date(0).toISOString(),
      verification: this.verification(value?.verification),
      notes: value?.notes ?? null,
      metadata: value?.metadata ?? null,
      parentId: value?.parentId ?? null,
    };
  }

  private parseValue(value: unknown): EvidenceValue | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Partial<EvidenceValue>;
    return record.kind === 'agent_evidence' && typeof record.id === 'string'
      ? (record as EvidenceValue)
      : null;
  }

  private evidenceKey(id: string): string {
    return `agent_evidence:${id}`;
  }

  private sha256(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private evidenceType(value: unknown): AgentEvidenceType {
    return value === 'tool_result' ||
      value === 'runtime_observation' ||
      value === 'validation' ||
      value === 'pulse' ||
      value === 'commercial_event' ||
      value === 'manual'
      ? value
      : 'runtime_observation';
  }

  private verification(value: unknown): AgentEvidenceVerificationState {
    return value === 'single_source' || value === 'multi_source_verified' ? value : 'unverified';
  }
}
