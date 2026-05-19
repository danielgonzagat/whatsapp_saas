import type { AgentRuntimeSchedulerService, AgentRuntimeSessionStore } from './agent-runtime';
import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';

const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;

export interface ToolCreateAgentJobArgs {
  jobId?: string;
  title: string;
  prompt: string;
  everyMinutes?: number;
  runAt?: string;
  toolScope?: string[];
}

export interface ToolSetAgentJobEnabledArgs {
  jobId: string;
  enabled: boolean;
}

export interface ToolSearchAgentMemoryArgs {
  query: string;
  limit?: number;
}

export interface ToolSearchAgentSessionsArgs {
  query: string;
  limit?: number;
}

export interface ToolGetAgentArtifactArgs {
  artifactId: string;
  maxChars?: number;
}

export async function runCreateAgentJob(
  scheduler: AgentRuntimeSchedulerService | undefined,
  workspaceId: string,
  args: ToolCreateAgentJobArgs,
): Promise<ToolResult> {
  if (!scheduler) {
    return { success: false, error: 'agent_scheduler_unavailable' };
  }
  const title = safeStr(args.title).trim().slice(0, 200);
  const prompt = safeStr(args.prompt).trim().slice(0, 4000);
  if (!title || !prompt) {
    return { success: false, error: 'missing_agent_job_title_or_prompt' };
  }
  const everyMinutes = Number(args.everyMinutes);
  const runAt = args.runAt ? new Date(args.runAt) : undefined;
  const hasValidRunAt = runAt && !Number.isNaN(runAt.getTime());
  const result = await scheduler.upsertJob({
    workspaceId,
    jobId: safeAgentRuntimeId(args.jobId, title) || 'job',
    title,
    prompt,
    schedule: hasValidRunAt
      ? { kind: 'once', runAt }
      : { kind: 'interval', everyMinutes: Number.isFinite(everyMinutes) ? everyMinutes : 60 },
    toolScope: Array.isArray(args.toolScope)
      ? args.toolScope.filter((tool): tool is string => typeof tool === 'string')
      : [],
  });
  return { success: true, message: 'Job autônomo registrado com governança.', ...result };
}

export async function runListAgentJobs(
  scheduler: AgentRuntimeSchedulerService | undefined,
  workspaceId: string,
): Promise<ToolResult> {
  if (!scheduler) {
    return { success: false, error: 'agent_scheduler_unavailable' };
  }
  const jobs = await scheduler.listJobs(workspaceId);
  return {
    success: true,
    jobs,
    message: jobs.length ? `Jobs autônomos: ${jobs.length}` : 'Nenhum job autônomo registrado.',
  };
}

export async function runSetAgentJobEnabled(
  scheduler: AgentRuntimeSchedulerService | undefined,
  workspaceId: string,
  args: ToolSetAgentJobEnabledArgs,
): Promise<ToolResult> {
  if (!scheduler) {
    return { success: false, error: 'agent_scheduler_unavailable' };
  }
  const jobId = safeStr(args.jobId).trim().slice(0, 160);
  if (!jobId) {
    return { success: false, error: 'missing_agent_job_id' };
  }
  const result = await scheduler.setJobEnabled({ workspaceId, jobId, enabled: args.enabled === true });
  return {
    success: result.ok,
    key: result.key,
    enabled: result.enabled,
    ...(result.reason ? { error: result.reason } : {}),
  };
}

export async function runSearchAgentMemory(
  sessions: AgentRuntimeSessionStore | undefined,
  workspaceId: string,
  args: ToolSearchAgentMemoryArgs,
): Promise<ToolResult> {
  if (!sessions) {
    return { success: false, error: 'agent_memory_unavailable' };
  }
  const query = safeStr(args.query).trim();
  if (!query) {
    return { success: false, error: 'missing_agent_memory_query' };
  }
  return { success: true, ...(await sessions.search(workspaceId, query, args.limit ?? 6)) };
}

export async function runSearchAgentSessions(
  sessions: AgentRuntimeSessionStore | undefined,
  workspaceId: string,
  args: ToolSearchAgentSessionsArgs,
): Promise<ToolResult> {
  if (!sessions) {
    return { success: false, error: 'agent_memory_unavailable' };
  }
  const query = safeStr(args.query).trim();
  if (!query) {
    return { success: false, error: 'missing_agent_session_query' };
  }
  return { success: true, ...(await sessions.searchSessions(workspaceId, query, args.limit ?? 3)) };
}

export async function runGetAgentArtifact(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolGetAgentArtifactArgs,
): Promise<ToolResult> {
  const artifactId = safeStr(args.artifactId).trim().slice(0, 220);
  if (!artifactId || !artifactId.startsWith('tool_artifact:')) {
    return { success: false, error: 'invalid_agent_artifact_id' };
  }
  const row = await prisma.kloelMemory.findUnique({
    where: { workspaceId_key: { workspaceId, key: artifactId } },
  });
  if (!row || row.category !== 'tool_artifact') {
    return { success: false, error: 'agent_artifact_not_found' };
  }
  const rawContent = safeStr(row.content);
  const maxChars = Math.max(500, Math.min(Number(args.maxChars) || 12_000, 50_000));
  const truncated = rawContent.length > maxChars;
  let parsed: unknown = null;
  try {
    parsed = rawContent ? JSON.parse(rawContent) : null;
  } catch {
    parsed = null;
  }
  return {
    success: true,
    artifactId,
    category: row.category,
    type: row.type ?? null,
    originalChars: rawContent.length,
    truncated,
    content: rawContent.slice(0, maxChars),
    parsed: truncated ? null : parsed,
    updatedAt: row.updatedAt,
    message: truncated
      ? 'Artefato recuperado parcialmente por limite de contexto.'
      : 'Artefato recuperado da memória operacional.',
  };
}

function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function safeAgentRuntimeId(value: unknown, fallback: string): string {
  return safeStr(value, fallback).trim().toLowerCase().replace(NON_SLUG_CHAR_RE, '_').slice(0, 80);
}
