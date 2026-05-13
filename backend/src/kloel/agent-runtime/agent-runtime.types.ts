import type { Prisma } from '@prisma/client';

export type AgentRuntimeTruthMode = 'observed' | 'inferred' | 'projected';
export type AgentRuntimeRiskLevel = 'safe' | 'normal' | 'high' | 'critical';
export type AgentRuntimeAuthorityMode = 'advisory' | 'tool_limited' | 'human_required';

export interface AgentRuntimeSourceStamp {
  source: string;
  confidence: number;
  freshness: 'fresh' | 'stale' | 'missing';
  truthMode: AgentRuntimeTruthMode;
  observedAt: string;
}

export interface AgentRuntimeMemoryItem {
  id: string;
  key: string;
  category: string;
  content: string;
  value: Prisma.JsonValue;
  source: AgentRuntimeSourceStamp;
}

export interface AgentRuntimeRecallResult {
  query: string;
  totalFound: number;
  memories: AgentRuntimeMemoryItem[];
}

export interface AgentSkillDefinition {
  id: string;
  title: string;
  summary: string;
  category: 'commercial' | 'operational' | 'pulse' | 'workspace';
  riskLevel: AgentRuntimeRiskLevel;
  allowedTools: string[];
  requiredEvidence: string[];
  validation: string[];
  rollback: string[];
  metrics: string[];
  body: string;
  version: number;
  updatedAt: string;
}

export interface AgentSkillSelection {
  skill: AgentSkillDefinition;
  score: number;
  reasons: string[];
}

export interface AgentPulseSelfModel {
  status: 'ready' | 'degraded' | 'empty';
  authorityMode: string;
  canWorkNow: boolean;
  canDeclareComplete: boolean;
  score: number | null;
  blockingReasons: string[];
  nextSafeUnits: string[];
  generatedAt: string;
}

export interface AgentRuntimePolicyEnvelope {
  id: string;
  workspaceId: string;
  toolName: string;
  riskLevel: AgentRuntimeRiskLevel;
  authorityMode: AgentRuntimeAuthorityMode;
  allowed: boolean;
  requiresHumanApproval: boolean;
  reasons: string[];
  createdAt: string;
}

export interface AgentRuntimeContextRequest {
  workspaceId: string;
  userId?: string;
  channel: string;
  message: string;
  contactId?: string;
  threadId?: string;
  allowedTools?: string[];
}

export interface AgentRuntimeContext {
  systemPromptBlock: string;
  recall: AgentRuntimeRecallResult;
  selectedSkills: AgentSkillSelection[];
  pulse: AgentPulseSelfModel;
  authorityMode: AgentRuntimeAuthorityMode;
}

export interface AgentRuntimeTurnRecord {
  workspaceId: string;
  channel: string;
  userMessage: string;
  assistantMessage?: string;
  contactId?: string;
  threadId?: string;
  userId?: string;
  intent?: string;
  confidence?: number;
  actions?: Array<{ toolName: string; success: boolean; result?: unknown }>;
}
