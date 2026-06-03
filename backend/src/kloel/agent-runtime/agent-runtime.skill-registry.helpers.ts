import type { Prisma } from '@prisma/client';
import { VALID_SKILL_ID_RE } from '../../common/regex';
import type {
  AgentSkillDefinition,
  AgentSkillLifecycleState,
  AgentSkillProvenance,
  AgentSkillUsageOutcome,
  AgentSkillUsageStats,
  AgentToolDelegationRule,
} from './agent-runtime.types';

/**
 * Maximum allowed character length for a serialized skill body. Lifted from
 * the original `AgentRuntimeSkillRegistry` so callers and tests can validate
 * skill payload size without instantiating the NestJS service.
 */
export const MAX_SKILL_CONTENT_CHARS = 100_000;

/** Normalize an unknown value into an array of strings. */
export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Coerce an unknown into one of the allowed skill categories. */
export function categoryFor(value: unknown): AgentSkillDefinition['category'] {
  return value === 'commercial' || value === 'operational' || value === 'workspace'
    ? value
    : 'operational';
}

/** Coerce an unknown into one of the allowed skill risk levels. */
export function riskFor(value: unknown): AgentSkillDefinition['riskLevel'] {
  return value === 'safe' || value === 'normal' || value === 'high' || value === 'critical'
    ? value
    : 'normal';
}

/** Coerce an unknown into one of the allowed delegation risk classes. */
export function delegationRiskClass(value: unknown): AgentToolDelegationRule['riskClass'] {
  return value === 'R1' || value === 'R2' || value === 'R3' || value === 'R4' ? value : 'R1';
}

/** Coerce an unknown into one of the allowed delegation permissions. */
export function delegationPermission(value: unknown): AgentToolDelegationRule['permission'] {
  return value === 'allowed_alone' ||
    value === 'with_approval' ||
    value === 'escalate' ||
    value === 'prohibited'
    ? value
    : 'allowed_alone';
}

/** Coerce an unknown into one of the allowed skill provenance values. */
export function provenanceFor(value: unknown): AgentSkillProvenance {
  return value === 'default' ||
    value === 'workspace' ||
    value === 'background_review' ||
    value === 'imported'
    ? value
    : 'workspace';
}

/** Coerce an unknown into one of the allowed lifecycle states. */
export function lifecycleFor(value: unknown): AgentSkillLifecycleState {
  return value === 'active' || value === 'stale' || value === 'archived' ? value : 'active';
}

/** Type guard for skill usage outcomes. */
export function isUsageOutcome(value: unknown): value is AgentSkillUsageOutcome {
  return (
    value === 'selected' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'patched' ||
    value === 'viewed'
  );
}

/** Coerce an unknown into a non-negative integer (zero on invalid input). */
export function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** Extract a human-readable message from an unknown thrown value. */
export function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse an unknown JSON value into a list of delegation rules, ignoring malformed entries. */
export function parseDelegationRules(value: unknown): AgentToolDelegationRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    )
    .map((entry) => ({
      toolName: typeof entry.toolName === 'string' ? entry.toolName : '',
      riskClass: delegationRiskClass(entry.riskClass),
      permission: delegationPermission(entry.permission),
      rollback: stringArray(entry.rollback),
    }))
    .filter((rule) => rule.toolName.length > 0);
}

/** Parse a persisted Prisma JSON value into a structured skill definition. */
export function parseSkill(value: Prisma.JsonValue): AgentSkillDefinition | null {
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
    category: categoryFor(record.category),
    riskLevel: riskFor(record.riskLevel),
    allowedTools: stringArray(record.allowedTools),
    requiredEvidence: stringArray(record.requiredEvidence),
    validation: stringArray(record.validation),
    rollback: stringArray(record.rollback),
    metrics: stringArray(record.metrics),
    delegationRules: parseDelegationRules(record.delegationRules),
    body: typeof record.body === 'string' ? record.body : '',
    version: typeof record.version === 'number' ? record.version : 1,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}

/** Parse a persisted Prisma JSON value into structured skill usage stats. */
export function parseUsageStats(
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
  const outcome = isUsageOutcome(record.lastOutcome) ? record.lastOutcome : 'selected';
  return {
    skillId,
    provenance: provenanceFor(record.provenance),
    lifecycleState: lifecycleFor(record.lifecycleState),
    pinned: record.pinned === true,
    selectedCount: nonNegativeNumber(record.selectedCount),
    successCount: nonNegativeNumber(record.successCount),
    failureCount: nonNegativeNumber(record.failureCount),
    patchCount: nonNegativeNumber(record.patchCount),
    viewCount: nonNegativeNumber(record.viewCount),
    lastUsedAt:
      typeof record.lastUsedAt === 'string' ? record.lastUsedAt : new Date(0).toISOString(),
    lastOutcome: outcome,
    ...(typeof record.lastReason === 'string' ? { lastReason: record.lastReason } : {}),
  };
}

/** Render a skill into a flat text blob used for indexing and content storage. */
export function buildSkillContent(skill: AgentSkillDefinition): string {
  const delegationLines = skill.delegationRules.map(
    (rule) =>
      `delegation=${rule.toolName}:${rule.riskClass}:${rule.permission}${rule.rollback.length ? ` ro:${rule.rollback.join(',')}` : ''}`,
  );
  return [
    `${skill.title}: ${skill.summary}`,
    `risk=${skill.riskLevel}`,
    `tools=${skill.allowedTools.join(', ') || 'none'}`,
    `evidence=${skill.requiredEvidence.join(', ') || 'none'}`,
    `validation=${skill.validation.join(', ') || 'none'}`,
    `rollback=${skill.rollback.join(', ') || 'none'}`,
    `metrics=${skill.metrics.join(', ') || 'none'}`,
    ...delegationLines,
    skill.body,
  ].join('\n');
}

/** Validate a skill definition. Returns the list of reason codes for any failure (empty when valid). */
export function validateSkill(skill: AgentSkillDefinition): string[] {
  const errors: string[] = [];
  if (!VALID_SKILL_ID_RE.test(skill.id)) {
    errors.push('invalid_skill_id');
  }
  if (!skill.title.trim()) {
    errors.push('missing_title');
  }
  if (!skill.summary.trim()) {
    errors.push('missing_summary');
  }
  const content = buildSkillContent(skill);
  if (content.length > MAX_SKILL_CONTENT_CHARS) {
    errors.push('skill_too_large');
  }
  if (skill.riskLevel === 'critical' && skill.validation.length === 0) {
    errors.push('critical_skill_requires_validation');
  }
  const allowedTools = new Set(skill.allowedTools);
  for (const rule of skill.delegationRules) {
    if (!allowedTools.has(rule.toolName)) {
      errors.push('delegation_rule_tool_not_allowed');
      break;
    }
  }
  return errors;
}

/** Overlay stored skills on top of the bundled defaults (stored entries win by id). */
export function mergeSkillsWithDefaults(
  defaults: readonly AgentSkillDefinition[],
  stored: readonly AgentSkillDefinition[],
): AgentSkillDefinition[] {
  const byId = new Map<string, AgentSkillDefinition>();
  for (const skill of defaults) {
    byId.set(skill.id, skill);
  }
  for (const skill of stored) {
    byId.set(skill.id, skill);
  }
  return [...byId.values()];
}
