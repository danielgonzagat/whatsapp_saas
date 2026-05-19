import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyMemorySafety,
  sanitizeAgentRuntimeText,
  toInputJsonValue,
} from './agent-runtime.sanitizer';
import { DEFAULT_SKILLS } from './agent-runtime.skill-registry.defaults';
import type {
  AgentSkillDefinition,
  AgentSkillLifecycleState,
  AgentSkillProvenance,
  AgentSkillSelection,
  AgentSkillUsageOutcome,
  AgentSkillUsageStats,
} from './agent-runtime.types';
const VALID_SKILL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_SKILL_CONTENT_CHARS = 100_000;
@Injectable()
export class AgentRuntimeSkillRegistry {
  private readonly logger = StructuredLogger.from(AgentRuntimeSkillRegistry.name);
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}
  async listSkills(workspaceId: string): Promise<AgentSkillDefinition[]> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'agent_skill' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { value: true },
    });
    const stored = rows
      .map((row) => this.parseSkill(row.value))
      .filter((skill): skill is AgentSkillDefinition => skill !== null);
    return this.mergeDefaults(stored);
  }
  async selectSkills(
    workspaceId: string,
    message: string,
    limit = 3,
  ): Promise<AgentSkillSelection[]> {
    const normalized = sanitizeAgentRuntimeText(message, 1000).toLowerCase();
    const [skills, usageBySkill] = await Promise.all([
      this.listSkills(workspaceId),
      this.loadUsageStats(workspaceId),
    ]);
    return skills
      .map((skill) => {
        const haystack = [
          skill.id,
          skill.title,
          skill.summary,
          skill.body,
          ...skill.allowedTools,
          ...skill.requiredEvidence,
        ]
          .join(' ')
          .toLowerCase();
        const words = normalized.split(/\s+/).filter((word) => word.length >= 4);
        const hits = words.filter((word) => haystack.includes(word));
        const usage = usageBySkill.get(skill.id);
        const successBoost = usage ? Math.min(3, Math.floor(usage.successCount / 2)) : 0;
        const failurePenalty = usage ? Math.min(2, usage.failureCount) : 0;
        const pinnedBoost = usage?.pinned ? 2 : 0;
        const lifecyclePenalty =
          usage?.lifecycleState === 'stale' ? 1 : usage?.lifecycleState === 'archived' ? 4 : 0;
        const score =
          hits.length +
          (haystack.includes(normalized) ? 3 : 0) +
          successBoost +
          pinnedBoost -
          failurePenalty -
          lifecyclePenalty;
        const reasons = hits.slice(0, 5).map((word) => `match:${word}`);
        if (usage?.successCount) {
          reasons.push(`usage:success:${usage.successCount}`);
        }
        if (usage?.failureCount) {
          reasons.push(`usage:failure:${usage.failureCount}`);
        }
        if (usage?.pinned) {
          reasons.push('usage:pinned');
        }
        if (usage?.lifecycleState && usage.lifecycleState !== 'active') {
          reasons.push(`usage:lifecycle:${usage.lifecycleState}`);
        }
        return {
          skill,
          score,
          reasons,
        };
      })
      .filter((selection) => selection.score > 0 || selection.skill.category === 'pulse')
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit, 8)));
  }
  async upsertSkill(
    workspaceId: string,
    skill: AgentSkillDefinition,
  ): Promise<{
    ok: boolean;
    reasons: string[];
    version?: number;
  }> {
    const validationErrors = this.validateSkill(skill);
    if (validationErrors.length > 0) {
      return { ok: false, reasons: validationErrors };
    }
    const content = this.skillContent(skill);
    const safety = classifyMemorySafety(content);
    if (!safety.safe) {
      return { ok: false, reasons: safety.reasons };
    }
    try {
      const existingRow = await this.prisma.kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key: `agent_skill:${skill.id}` } },
        select: { value: true },
      });
      const existingSkill = existingRow ? this.parseSkill(existingRow.value) : null;
      const now = new Date().toISOString();
      const version = existingSkill
        ? Math.max(existingSkill.version + 1, skill.version || 1)
        : Math.max(skill.version || 1, 1);
      const persistedSkill: AgentSkillDefinition = {
        ...skill,
        version,
        updatedAt: now,
      };
      const persistedContent = this.skillContent(persistedSkill);
      const metadata = {
        kind: 'agent_skill',
        version,
        previousVersion: existingSkill?.version ?? null,
        riskLevel: persistedSkill.riskLevel,
        category: persistedSkill.category,
        updatedAt: now,
      } satisfies Prisma.InputJsonObject;
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: `agent_skill:${skill.id}` } },
        update: {
          value: toInputJsonValue(persistedSkill),
          content: persistedContent,
          type: persistedSkill.category,
          metadata,
        },
        create: {
          workspaceId,
          key: `agent_skill:${skill.id}`,
          category: 'agent_skill',
          type: persistedSkill.category,
          value: toInputJsonValue(persistedSkill),
          content: persistedContent,
          metadata,
        },
      });
      return { ok: true, reasons: [], version };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeSkillRegistry.upsertSkill');
      this.logger.warn(`Failed to upsert agent skill: ${this.messageFor(error)}`);
      return { ok: false, reasons: ['persistence_failed'] };
    }
  }
  async recordSkillUsage(
    workspaceId: string,
    params: {
      skillId: string;
      outcome: AgentSkillUsageOutcome;
      reason?: string;
      provenance?: AgentSkillProvenance;
      pinned?: boolean;
      lifecycleState?: AgentSkillLifecycleState;
    },
  ): Promise<{ ok: boolean; stats?: AgentSkillUsageStats; reason?: string }> {
    const skillId = sanitizeAgentRuntimeText(params.skillId, 80).trim().toLowerCase();
    if (!VALID_SKILL_ID_RE.test(skillId)) {
      return { ok: false, reason: 'invalid_skill_id' };
    }
    if (!this.isUsageOutcome(params.outcome)) {
      return { ok: false, reason: 'invalid_usage_outcome' };
    }
    try {
      const key = `agent_skill_usage:${skillId}`;
      const existingRow = await this.prisma.kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key } },
        select: { value: true },
      });
      const previous = existingRow ? this.parseUsageStats(existingRow.value, skillId) : null;
      const now = new Date().toISOString();
      const next: AgentSkillUsageStats = {
        skillId,
        provenance: this.provenanceFor(params.provenance ?? previous?.provenance),
        lifecycleState: this.lifecycleFor(params.lifecycleState ?? previous?.lifecycleState),
        pinned: params.pinned ?? previous?.pinned ?? false,
        selectedCount: (previous?.selectedCount ?? 0) + (params.outcome === 'selected' ? 1 : 0),
        successCount: (previous?.successCount ?? 0) + (params.outcome === 'succeeded' ? 1 : 0),
        failureCount: (previous?.failureCount ?? 0) + (params.outcome === 'failed' ? 1 : 0),
        patchCount: (previous?.patchCount ?? 0) + (params.outcome === 'patched' ? 1 : 0),
        viewCount: (previous?.viewCount ?? 0) + (params.outcome === 'viewed' ? 1 : 0),
        lastUsedAt: now,
        lastOutcome: params.outcome,
        ...(params.reason ? { lastReason: sanitizeAgentRuntimeText(params.reason, 300) } : {}),
      };
      const content = [
        `skill=${next.skillId}`,
        `outcome=${next.lastOutcome}`,
        `selected=${next.selectedCount}`,
        `success=${next.successCount}`,
        `failure=${next.failureCount}`,
        `patch=${next.patchCount}`,
        `view=${next.viewCount}`,
        `provenance=${next.provenance}`,
        `lifecycle=${next.lifecycleState}`,
        next.lastReason ? `reason=${next.lastReason}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const metadata = {
        kind: 'agent_skill_usage',
        skillId: next.skillId,
        outcome: next.lastOutcome,
        provenance: next.provenance,
        lifecycleState: next.lifecycleState,
        pinned: next.pinned,
        updatedAt: now,
      } satisfies Prisma.InputJsonObject;
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key } },
        update: {
          value: toInputJsonValue(next),
          content,
          type: next.lifecycleState,
          metadata,
        },
        create: {
          workspaceId,
          key,
          category: 'agent_skill_usage',
          type: next.lifecycleState,
          value: toInputJsonValue(next),
          content,
          metadata,
        },
      });
      return { ok: true, stats: next };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeSkillRegistry.recordSkillUsage');
      this.logger.warn(`Failed to record agent skill usage: ${this.messageFor(error)}`);
      return { ok: false, reason: 'persistence_failed' };
    }
  }
  private mergeDefaults(stored: AgentSkillDefinition[]): AgentSkillDefinition[] {
    const byId = new Map<string, AgentSkillDefinition>();
    for (const skill of DEFAULT_SKILLS) {
      byId.set(skill.id, skill);
    }
    for (const skill of stored) {
      byId.set(skill.id, skill);
    }
    return [...byId.values()];
  }
  private parseSkill(value: Prisma.JsonValue): AgentSkillDefinition | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.title !== 'string') {
      return null;
    }
    return {
      id: record.id,
      title: record.title,
      summary: typeof record.summary === 'string' ? record.summary : '',
      category: this.categoryFor(record.category),
      riskLevel: this.riskFor(record.riskLevel),
      allowedTools: this.stringArray(record.allowedTools),
      requiredEvidence: this.stringArray(record.requiredEvidence),
      validation: this.stringArray(record.validation),
      rollback: this.stringArray(record.rollback),
      metrics: this.stringArray(record.metrics),
      body: typeof record.body === 'string' ? record.body : '',
      version: typeof record.version === 'number' ? record.version : 1,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    };
  }
  private async loadUsageStats(workspaceId: string): Promise<Map<string, AgentSkillUsageStats>> {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'agent_skill_usage' },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { value: true },
    });
    const stats = new Map<string, AgentSkillUsageStats>();
    for (const row of rows) {
      const parsed = this.parseUsageStats(row.value);
      if (parsed) {
        stats.set(parsed.skillId, parsed);
      }
    }
    return stats;
  }
  private parseUsageStats(
    value: Prisma.JsonValue,
    fallbackSkillId?: string,
  ): AgentSkillUsageStats | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const skillId =
      typeof record.skillId === 'string' && VALID_SKILL_ID_RE.test(record.skillId)
        ? record.skillId
        : fallbackSkillId;
    if (!skillId) {
      return null;
    }
    const outcome = this.isUsageOutcome(record.lastOutcome) ? record.lastOutcome : 'selected';
    return {
      skillId,
      provenance: this.provenanceFor(record.provenance),
      lifecycleState: this.lifecycleFor(record.lifecycleState),
      pinned: record.pinned === true,
      selectedCount: this.nonNegativeNumber(record.selectedCount),
      successCount: this.nonNegativeNumber(record.successCount),
      failureCount: this.nonNegativeNumber(record.failureCount),
      patchCount: this.nonNegativeNumber(record.patchCount),
      viewCount: this.nonNegativeNumber(record.viewCount),
      lastUsedAt:
        typeof record.lastUsedAt === 'string' ? record.lastUsedAt : new Date(0).toISOString(),
      lastOutcome: outcome,
      ...(typeof record.lastReason === 'string' ? { lastReason: record.lastReason } : {}),
    };
  }
  private skillContent(skill: AgentSkillDefinition): string {
    return [
      `${skill.title}: ${skill.summary}`,
      `risk=${skill.riskLevel}`,
      `tools=${skill.allowedTools.join(', ') || 'none'}`,
      `evidence=${skill.requiredEvidence.join(', ') || 'none'}`,
      `validation=${skill.validation.join(', ') || 'none'}`,
      `rollback=${skill.rollback.join(', ') || 'none'}`,
      `metrics=${skill.metrics.join(', ') || 'none'}`,
      skill.body,
    ].join('\n');
  }
  private validateSkill(skill: AgentSkillDefinition): string[] {
    const errors: string[] = [];
    if (!VALID_SKILL_ID_RE.test(skill.id)) errors.push('invalid_skill_id');
    if (!skill.title.trim()) errors.push('missing_title');
    if (!skill.summary.trim()) errors.push('missing_summary');
    const content = this.skillContent(skill);
    if (content.length > MAX_SKILL_CONTENT_CHARS) errors.push('skill_too_large');
    if (skill.riskLevel === 'critical' && skill.validation.length === 0)
      errors.push('critical_skill_requires_validation');
    return errors;
  }
  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }
  private categoryFor(value: unknown): AgentSkillDefinition['category'] {
    return value === 'commercial' || value === 'operational' || value === 'pulse' || value === 'workspace'
      ? value
      : 'operational';
  }
  private riskFor(value: unknown): AgentSkillDefinition['riskLevel'] {
    return value === 'safe' || value === 'normal' || value === 'high' || value === 'critical'
      ? value
      : 'normal';
  }
  private provenanceFor(value: unknown): AgentSkillProvenance {
    return value === 'default' || value === 'workspace' || value === 'background_review' || value === 'imported'
      ? value
      : 'workspace';
  }
  private lifecycleFor(value: unknown): AgentSkillLifecycleState {
    return value === 'active' || value === 'stale' || value === 'archived' ? value : 'active';
  }
  private isUsageOutcome(value: unknown): value is AgentSkillUsageOutcome {
    return value === 'selected' || value === 'succeeded' || value === 'failed' || value === 'patched' || value === 'viewed';
  }
  private nonNegativeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }
  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
