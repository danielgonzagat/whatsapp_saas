import type {
  AgentRuntimeEvidenceStoreService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
  AgentEvidenceType,
  AgentEvidenceVerificationState,
  AgentSkillDefinition,
  AgentSkillLifecycleState,
  AgentSkillProvenance,
  AgentSkillUsageOutcome,
} from './agent-runtime';

import type { ToolResult } from './kloel-tool-executor.types';
import { safeStr } from '../common/string';
export type { ToolResult };

export interface ToolUpsertAgentSkillArgs {
  id: string;
  title: string;
  summary: string;
  category?: AgentSkillDefinition['category'];
  riskLevel?: AgentSkillDefinition['riskLevel'];
  allowedTools?: string[];
  requiredEvidence?: string[];
  validation?: string[];
  rollback?: string[];
  metrics?: string[];
  body?: string;
}

export interface ToolRecordAgentSkillOutcomeArgs {
  skillId: string;
  outcome: AgentSkillUsageOutcome;
  reason?: string;
  provenance?: AgentSkillProvenance;
  pinned?: boolean;
  lifecycleState?: AgentSkillLifecycleState;
}

export interface ToolRecordAgentDelegationArgs {
  sessionId?: string;
  task: string;
  result: string;
  childSessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolRecordAgentEvidenceArgs {
  source: string;
  content: string;
  type?: AgentEvidenceType;
  actor?: string;
  url?: string;
  eventTimestamp?: string;
  verification?: AgentEvidenceVerificationState;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolSearchAgentEvidenceArgs {
  query: string;
  limit?: number;
}

export interface ToolListAgentEvidenceArgs {
  type?: AgentEvidenceType;
  actor?: string;
  limit?: number;
}

const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;

function safeAgentRuntimeId(value: unknown, fallback: string): string {
  return safeStr(value, fallback).trim().toLowerCase().replace(NON_SLUG_CHAR_RE, '_').slice(0, 80);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function agentSkillCategory(value: unknown): AgentSkillDefinition['category'] {
  return value === 'commercial' ||
    value === 'operational' ||
    value === 'pulse' ||
    value === 'workspace'
    ? value
    : 'operational';
}

function agentSkillRisk(value: unknown): AgentSkillDefinition['riskLevel'] {
  return value === 'safe' || value === 'normal' || value === 'high' || value === 'critical'
    ? value
    : 'normal';
}

function agentSkillUsageOutcome(value: unknown): AgentSkillUsageOutcome {
  return value === 'succeeded' ||
    value === 'failed' ||
    value === 'patched' ||
    value === 'viewed' ||
    value === 'selected'
    ? value
    : 'selected';
}

function agentSkillProvenance(value: unknown): AgentSkillProvenance | undefined {
  return value === 'default' ||
    value === 'workspace' ||
    value === 'background_review' ||
    value === 'imported'
    ? value
    : undefined;
}

function agentSkillLifecycle(value: unknown): AgentSkillLifecycleState | undefined {
  return value === 'active' || value === 'stale' || value === 'archived' ? value : undefined;
}

function agentEvidenceType(value: unknown): AgentEvidenceType {
  return value === 'tool_result' ||
    value === 'runtime_observation' ||
    value === 'validation' ||
    value === 'pulse' ||
    value === 'commercial_event' ||
    value === 'manual'
    ? value
    : 'runtime_observation';
}

function agentEvidenceVerification(value: unknown): AgentEvidenceVerificationState {
  return value === 'single_source' || value === 'multi_source_verified' ? value : 'unverified';
}

export async function runUpsertAgentSkill(
  agentSkills: AgentRuntimeSkillRegistry | undefined,
  workspaceId: string,
  args: ToolUpsertAgentSkillArgs,
): Promise<ToolResult> {
  if (!agentSkills) return { success: false, error: 'agent_skill_registry_unavailable' };
  const id = safeAgentRuntimeId(args.id, '');
  const title = safeStr(args.title).trim().slice(0, 200);
  const summary = safeStr(args.summary).trim().slice(0, 500);
  if (!id || !title || !summary) return { success: false, error: 'missing_agent_skill_identity' };
  const skill: AgentSkillDefinition = {
    id,
    title,
    summary,
    category: agentSkillCategory(args.category),
    riskLevel: agentSkillRisk(args.riskLevel),
    allowedTools: stringList(args.allowedTools),
    requiredEvidence: stringList(args.requiredEvidence),
    delegationRules: [],
    validation: stringList(args.validation),
    rollback: stringList(args.rollback),
    metrics: stringList(args.metrics),
    body: safeStr(args.body).trim().slice(0, 4000),
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const result = await agentSkills.upsertSkill(workspaceId, skill);
  return {
    success: result.ok,
    skillId: skill.id,
    version: result.version,
    reasons: result.reasons,
    message: result.ok ? 'Skill procedural registrada.' : 'Skill procedural recusada.',
  };
}

export async function runRecordAgentSkillOutcome(
  agentSkills: AgentRuntimeSkillRegistry | undefined,
  workspaceId: string,
  args: ToolRecordAgentSkillOutcomeArgs,
): Promise<ToolResult> {
  if (!agentSkills) return { success: false, error: 'agent_skill_registry_unavailable' };
  const skillId = safeAgentRuntimeId(args.skillId, '');
  if (!skillId) return { success: false, error: 'missing_agent_skill_id' };
  const outcome = agentSkillUsageOutcome(args.outcome);
  const provenance = agentSkillProvenance(args.provenance);
  const lifecycleState = agentSkillLifecycle(args.lifecycleState);
  const result = await agentSkills.recordSkillUsage(workspaceId, {
    skillId,
    outcome,
    reason: safeStr(args.reason).trim().slice(0, 300),
    ...(provenance !== undefined ? { provenance } : {}),
    ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
    ...(lifecycleState !== undefined ? { lifecycleState } : {}),
  });
  return {
    success: result.ok,
    skillId,
    outcome,
    stats: result.stats,
    ...(result.reason ? { error: result.reason } : {}),
    message: result.ok ? 'Uso da skill registrado.' : 'Uso da skill recusado.',
  };
}

export async function runRecordAgentDelegation(
  agentSessions: AgentRuntimeSessionStore | undefined,
  workspaceId: string,
  args: ToolRecordAgentDelegationArgs,
): Promise<ToolResult> {
  if (!agentSessions) return { success: false, error: 'agent_sessions_unavailable' };
  const task = safeStr(args.task).trim().slice(0, 2000);
  const result = safeStr(args.result).trim().slice(0, 3000);
  if (!task || !result) return { success: false, error: 'missing_delegation_task_or_result' };
  const sessionId = safeStr(args.sessionId, 'kloel_delegation').trim().slice(0, 160);
  const childSessionId = safeStr(args.childSessionId).trim().slice(0, 160);
  const metadata =
    args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
      ? args.metadata
      : {};
  await agentSessions.recordRuntimeEvent({
    workspaceId,
    sessionId: sessionId || 'kloel_delegation',
    eventType: 'delegation',
    content: [`childSessionId=${childSessionId}`, `task: ${task}`, `result: ${result}`].join('\n'),
    metadata: {
      ...metadata,
      childSessionId: childSessionId || null,
      source: 'kloel_tool',
    },
  });
  return {
    success: true,
    message: 'Delegação registrada na memória operacional do Kloel.',
    sessionId: sessionId || 'kloel_delegation',
  };
}

export async function runRecordAgentEvidence(
  agentEvidence: AgentRuntimeEvidenceStoreService | undefined,
  workspaceId: string,
  args: ToolRecordAgentEvidenceArgs,
): Promise<ToolResult> {
  if (!agentEvidence) return { success: false, error: 'agent_evidence_store_unavailable' };
  const source = safeStr(args.source).trim().slice(0, 500);
  const content = safeStr(args.content).trim().slice(0, 30_000);
  if (!source || !content) {
    return { success: false, error: 'missing_agent_evidence_source_or_content' };
  }
  const evidence = await agentEvidence.add({
    workspaceId,
    source,
    content,
    type: agentEvidenceType(args.type),
    ...(args.actor ? { actor: safeStr(args.actor).trim().slice(0, 200) } : {}),
    ...(args.url ? { url: safeStr(args.url).trim().slice(0, 1000) } : {}),
    ...(args.eventTimestamp
      ? { eventTimestamp: safeStr(args.eventTimestamp).trim().slice(0, 100) }
      : {}),
    verification: agentEvidenceVerification(args.verification),
    ...(args.notes ? { notes: safeStr(args.notes).trim().slice(0, 2000) } : {}),
    ...(args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
      ? { metadata: args.metadata }
      : {}),
  });
  return {
    success: true,
    evidence,
    message: 'Evidência operacional registrada com hash de integridade.',
  };
}

export async function runSearchAgentEvidence(
  agentEvidence: AgentRuntimeEvidenceStoreService | undefined,
  workspaceId: string,
  args: ToolSearchAgentEvidenceArgs,
): Promise<ToolResult> {
  if (!agentEvidence) return { success: false, error: 'agent_evidence_store_unavailable' };
  const query = safeStr(args.query).trim();
  if (!query) return { success: false, error: 'missing_agent_evidence_query' };
  const evidence = await agentEvidence.query({
    workspaceId,
    keyword: query,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  });
  return { success: true, evidence, totalFound: evidence.length };
}

export async function runListAgentEvidence(
  agentEvidence: AgentRuntimeEvidenceStoreService | undefined,
  workspaceId: string,
  args: ToolListAgentEvidenceArgs,
): Promise<ToolResult> {
  if (!agentEvidence) return { success: false, error: 'agent_evidence_store_unavailable' };
  const evidence = await agentEvidence.list({
    workspaceId,
    ...(args.type ? { type: agentEvidenceType(args.type) } : {}),
    ...(args.actor ? { actor: safeStr(args.actor).trim().slice(0, 200) } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  });
  return { success: true, evidence, totalFound: evidence.length };
}

export async function runVerifyAgentEvidence(
  agentEvidence: AgentRuntimeEvidenceStoreService | undefined,
  workspaceId: string,
): Promise<ToolResult> {
  if (!agentEvidence) return { success: false, error: 'agent_evidence_store_unavailable' };
  const integrityIssues = await agentEvidence.verify(workspaceId);
  const summary = await agentEvidence.summary(workspaceId);
  return {
    success: integrityIssues.length === 0,
    integrityIssues,
    summary,
    message: integrityIssues.length
      ? 'Evidências com hash divergente encontradas.'
      : 'Todas as evidências verificadas mantêm integridade.',
  };
}
