import { shouldUseUnifiedAgent } from '../../providers/unified-agent-integrator';
import type { AutopilotDecision, UnknownRecord } from './shared';

export const FALLBACK_INTENT = 'GENERAL_ASSISTANCE';
export const AUTONOMOUS_FALLBACK_ACTION = 'AUTONOMOUS_FALLBACK';
export const AUTONOMOUS_FALLBACK_REASON = 'autonomous_fallback';
export const UNIFIED_AGENT_TEXT_ACTION = 'UNIFIED_AGENT_TEXT';
export const UNIFIED_AGENT_EXECUTED_ACTION = 'UNIFIED_AGENT_EXECUTED';

export type ScanDecisionStatus = 'sent' | 'failed' | 'skipped';

export interface ScanDecisionResult {
  status: ScanDecisionStatus;
  summary: string;
  keepReplyLock: boolean;
}

export type ExecutionResult = 'executed' | string;

export interface BuildIdempotencyContextInput {
  source: string;
  messageIds?: (string | null | undefined)[] | undefined;
  providerMessageIds?: (string | null | undefined)[] | undefined;
  runId?: string | null | undefined;
}

/**
 * Pure shape factory for the idempotencyContext object passed to send helpers.
 * Coerces undefined runId to null so the downstream contract stays stable.
 * Returns Record<string, unknown> so it is assignable to the wide signature
 * the executors and senders accept while still preserving observable keys.
 */
export function buildIdempotencyContext(
  input: BuildIdempotencyContextInput,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    source: input.source,
    runId: input.runId ?? null,
  };
  if (input.messageIds !== undefined) {
    ctx.messageIds = input.messageIds;
  }
  if (input.providerMessageIds !== undefined) {
    ctx.providerMessageIds = input.providerMessageIds;
  }
  return ctx;
}

export interface UnifiedAgentRouteInput {
  cognitiveState: UnknownRecord | null | undefined;
  productMatches: readonly string[];
  messageContent: string;
  leadScore?: number | undefined;
  settings: UnknownRecord;
}

/**
 * Pure gate that decides whether to route to the Unified Agent.
 * Mirrors the original disjunction in runScanDecisions so the gate
 * can be reasoned about, tested, and reused in isolation.
 */
export function shouldRouteToUnifiedAgent(input: UnifiedAgentRouteInput): boolean {
  const cognitive = input.cognitiveState ?? {};
  if (cognitive.nextBestAction === 'RESPOND') {
    return true;
  }
  if (input.productMatches.length > 0) {
    return true;
  }
  return shouldUseUnifiedAgent({
    messageContent: input.messageContent,
    leadScore: input.leadScore ?? undefined,
    settings: input.settings,
  });
}

/**
 * Pure check for smoke-test preview mode: a smokeTestId is present
 * and the smokeMode is not the explicit 'live' value.
 */
export function isPreviewMode(
  smokeTestId: string | undefined,
  smokeMode: 'dry-run' | 'live',
): boolean {
  return Boolean(smokeTestId) && smokeMode !== 'live';
}

/**
 * Stable preview result used when a smoke preview short-circuits the path.
 */
export function buildPreviewResult(summary: string): ScanDecisionResult {
  return {
    status: 'skipped',
    summary,
    keepReplyLock: false,
  };
}

/**
 * Stable skipped-by-human-gate result.
 */
export function buildSkippedResult(summary: string): ScanDecisionResult {
  return {
    status: 'skipped',
    summary,
    keepReplyLock: false,
  };
}

export interface ExecutionSummaryInput {
  executionResult: ExecutionResult;
  executedSummary: string;
  skippedSummary: string;
}

/**
 * Maps the executor return ('executed' | other) into the public
 * ScanDecisionResult contract. Centralizes the success/skip decision
 * so every send path renders identical semantics.
 */
export function buildExecutionSummary(input: ExecutionSummaryInput): ScanDecisionResult {
  const executed = input.executionResult === 'executed';
  return {
    status: executed ? 'sent' : 'skipped',
    summary: executed ? input.executedSummary : input.skippedSummary,
    keepReplyLock: executed,
  };
}

/**
 * Sent-result for the "already executed" branch where the Unified
 * Agent reported the action as fait accompli. keepReplyLock is true
 * because the conversation is owned by the autopilot until the next turn.
 */
export function buildAlreadyExecutedResult(summary: string): ScanDecisionResult {
  return {
    status: 'sent',
    summary,
    keepReplyLock: true,
  };
}

/**
 * Resolves the effective intent for fallback paths.
 * Defaults to GENERAL_ASSISTANCE when the decision left it blank.
 */
export function resolveFallbackIntent(decision: AutopilotDecision): string {
  return decision.intent || FALLBACK_INTENT;
}

/**
 * Resolves the effective reason for fallback paths.
 * Defaults to the autonomous_fallback constant when blank.
 */
export function resolveFallbackReason(decision: AutopilotDecision): string {
  return decision.reason || AUTONOMOUS_FALLBACK_REASON;
}

/**
 * Resolves whether the KB was consumed by the decision pipeline.
 * True when the decision itself flagged usedKb or when product matches
 * supplied knowledge context.
 */
export function resolveUsedKb(
  decision: AutopilotDecision,
  productMatches: readonly string[],
): boolean {
  return Boolean(decision.usedKb) || productMatches.length > 0;
}

export interface NoActionCheckResult {
  isNoAction: boolean;
}

/**
 * Detects the "no action / NONE" terminal branch in the decision.
 */
export function isNoActionDecision(decision: AutopilotDecision): boolean {
  return !decision.action || decision.action === 'NONE';
}

/**
 * Builds the summary string used for a successfully executed named action.
 */
export function formatActionExecutedSummary(action: string): string {
  return `Ação ${action} executada com sucesso.`;
}

/**
 * Builds the summary string used when an action was skipped by policy.
 */
export function formatActionSkippedSummary(action: string): string {
  return `Ação ${action} pulada por política operacional.`;
}
