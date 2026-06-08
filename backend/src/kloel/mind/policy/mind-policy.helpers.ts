import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { MindPolicyDecision } from '../../mind.types';
import { extractChannel } from '../inference/mind-belief-by-channel';

export type ResolvedPolicyRow = {
  baseline: string;
  context?: unknown;
  chosen: string;
  decisionType: string;
  id: string;
  outcome: number;
  outcomeKey: string | null;
  subject: string;
  workspaceId: string;
};

/**
 * Minimal row shape consumed by {@link buildResolveOutcomeUpdateData} and
 * {@link extractGlobalPriorRow}. Matches the `select` shape used by
 * `MindPolicyService.resolveOutcome`, `resolveOpenForSubject`, and
 * `sweepExpiredOutcomes` — keeping it narrow so pure helpers do not pin
 * unrelated Prisma columns.
 */
export interface MindPolicyResolutionRow {
  baseline: string;
  chosen: string;
  context: unknown;
  decisionType: string;
}

/**
 * Shared Prisma `select` shape for resolution queries across
 * {@link MindPolicyService.resolveOutcome}, {@link resolveOpenForSubject},
 * and {@link sweepExpiredOutcomes}.
 */
export const RESOLUTION_ROW_SELECT = {
  id: true,
  workspaceId: true,
  subject: true,
  decisionType: true,
  context: true,
  chosen: true,
  baseline: true,
  outcomeKey: true,
} as const;

/**
 * Build the `data:` payload for a `mindPolicy.updateMany` that resolves an
 * open policy row. Centralises the duplicated inline expression used by all
 * three resolution paths: it stamps a `resolvedAt` timestamp and computes
 * the counterfactual `baselineOutcome` via
 * {@link estimateCounterfactualBaselineOutcome} unless the caller supplies an
 * explicit override.
 *
 * Callers may pass a shared `resolvedAt` (e.g. `resolveOutcome` uses one
 * timestamp for every row inside the same transaction); when omitted the
 * helper falls back to `new Date()`, matching `resolveOpenForSubject` and
 * `sweepExpiredOutcomes` which mint a fresh Date per row.
 *
 * Pure — no DB writes; the only side effect is the optional `new Date()`
 * fallback, mirroring the original inline call sites.
 */
export function buildResolveOutcomeUpdateData(
  row: MindPolicyResolutionRow,
  outcome: number,
  baselineOutcomeOverride?: number,
  resolvedAt: Date = new Date(),
): { outcome: number; resolvedAt: Date; baselineOutcome: number } {
  const baselineOutcome =
    baselineOutcomeOverride ??
    estimateCounterfactualBaselineOutcome({
      baseline: row.baseline,
      chosen: row.chosen,
      context: row.context,
      outcome,
    });
  return {
    outcome,
    resolvedAt,
    baselineOutcome,
  };
}

/**
 * Reduce a resolved policy row to the `{channel, decisionType, action}`
 * triple that {@link KloelGlobalPriorService.recordObservation} consumes.
 * Returns `null` when the row's context lacks a string `channel` field,
 * letting callers `continue` past rows that can never participate in the
 * global prior.
 */
export function extractGlobalPriorRow(row: {
  context: unknown;
  decisionType: string;
  chosen: string;
}): { channel: string; decisionType: string; action: string } | null {
  const channel = extractChannel(row.context as Record<string, unknown>);
  if (!channel) {
    return null;
  }
  return { channel, decisionType: row.decisionType, action: row.chosen };
}

/**
 * Filter-map resolved rows into `{channel, decisionType, action}` triples
 * consumable by {@link KloelGlobalPriorService.recordObservation}. Rows
 * whose context lacks a string `channel` are silently dropped.
 */
export function collectGlobalPriorRows(
  rows: ReadonlyArray<{ context: unknown; decisionType: string; chosen: string }>,
): Array<{ channel: string; decisionType: string; action: string }> {
  const out: Array<{ channel: string; decisionType: string; action: string }> = [];
  for (const row of rows) {
    const triple = extractGlobalPriorRow(row);
    if (triple) {
      out.push(triple);
    }
  }
  return out;
}

/**
 * Gap 6: feed resolved outcomes back into the cross-workspace global prior.
 * Iterates resolved rows, extracts channel/decisionType/action triples via
 * {@link extractGlobalPriorRow}, and calls `recordObservation` on the
 * global-prior service. Errors are logged but never block the caller.
 *
 * Shared by {@link MindPolicyService.resolveOutcome} and
 * {@link resolveOpenForSubject} to deduplicate the observation loop.
 */
export async function recordOutcomeGlobalPrior(params: {
  globalPrior: {
    recordObservation(
      channel: string,
      decisionType: string,
      action: string,
      success: boolean,
    ): Promise<void>;
  };
  rows: ReadonlyArray<{ context: unknown; decisionType: string; chosen: string }>;
  outcome: number;
  logContext: Record<string, unknown>;
  logger: { error(msg: string, ctx: Record<string, unknown>): void };
}): Promise<void> {
  const { globalPrior, rows, outcome, logContext, logger } = params;
  const success = outcome >= 0.5;
  for (const row of rows) {
    const triple = extractGlobalPriorRow(row);
    if (!triple) {
      continue;
    }
    try {
      await globalPrior.recordObservation(
        triple.channel,
        triple.decisionType,
        triple.action,
        success,
      );
    } catch (err: unknown) {
      logger.error('Failed to record global prior observation', {
        ...logContext,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function twoProportionZScore(
  mindMean: number,
  baselineMean: number,
  mindSamples: number,
  baselineSamples: number,
): number {
  const totalSamples = mindSamples + baselineSamples;
  if (mindSamples <= 0 || baselineSamples <= 0 || totalSamples <= 0) {
    return 0;
  }
  const pooled =
    (mindMean * mindSamples + baselineMean * baselineSamples) / (mindSamples + baselineSamples);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / mindSamples + 1 / baselineSamples));
  return standardError > 0 ? (mindMean - baselineMean) / standardError : 0;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function estimateCounterfactualBaselineOutcome(row: {
  baseline: string;
  chosen: string;
  context?: unknown;
  outcome: number;
}): number {
  if (row.baseline === row.chosen) {
    return row.outcome;
  }
  const context = readRecord(row.context);
  const baselineScore = scoreAction(row.baseline, context);
  const chosenScore = scoreAction(row.chosen, context);
  const delta = clampNumber(baselineScore - chosenScore, -0.35, 0.35);
  return clampNumber(row.outcome + delta, 0, 1);
}

export function createPolicyRow(
  prisma: Pick<PrismaService, 'mindPolicy'> | Prisma.TransactionClient,
  decision: MindPolicyDecision,
) {
  return prisma.mindPolicy.create({
    data: {
      id: randomUUID(),
      workspaceId: decision.workspaceId,
      subject: decision.subject,
      decisionType: decision.decisionType,
      context: inputJson(decision.context),
      candidates: inputJson(decision.candidates),
      chosen: decision.chosen,
      baseline: decision.baseline,
      reasonInternal: decision.reasonInternal,
      outcomeKey: decision.outcomeKey ?? null,
      calcSteps: inputJson(decision.calcSteps),
      epsilon: decision.epsilon,
      utilitySuccess: decision.utilitySuccess,
      utilityFail: decision.utilityFail,
      fallbackActive: decision.fallbackActive,
      fallbackReason: decision.fallbackReason ?? null,
    },
  });
}

export async function persistResolvedPolicyMemories(
  memoryItems: PrismaService['kloelMemory'],
  rows: ResolvedPolicyRow[],
  baselineOutcome?: number,
): Promise<void> {
  for (const row of rows) {
    const resolvedBaselineOutcome = baselineOutcome ?? estimateCounterfactualBaselineOutcome(row);
    const value = {
      baseline: row.baseline,
      baselineOutcome: resolvedBaselineOutcome,
      chosen: row.chosen,
      decisionType: row.decisionType,
      outcome: row.outcome,
      outcomeKey: row.outcomeKey,
      subject: row.subject,
    };
    const content = [
      `decision=${row.decisionType}`,
      `subject=${row.subject}`,
      `chosen=${row.chosen}`,
      `baseline=${row.baseline}`,
      `outcome=${row.outcome}`,
    ].join(' ');

    await memoryItems.upsert({
      where: { workspaceId_key: { workspaceId: row.workspaceId, key: `mind:policy:${row.id}` } },
      create: {
        workspaceId: row.workspaceId,
        key: `mind:policy:${row.id}`,
        value,
        category: 'mind_outcomes',
        type: 'policy_outcome',
        content,
        metadata: { policyId: row.id },
      },
      update: {
        value,
        content,
        metadata: { policyId: row.id },
      },
    });
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function scoreAction(action: string, context: Record<string, unknown>): number {
  const normalized = action.toLowerCase();
  let score = 0.5;
  if (normalized.includes('pause') || normalized.includes('stop')) {
    score -= 0.24;
  }
  if (normalized.includes('no_coupon') || normalized.includes('continue_ai')) {
    score -= 0.08;
  }
  if (normalized.includes('coupon_5')) {
    score += 0.05;
  }
  if (normalized.includes('coupon_10')) {
    score += 0.1;
  }
  if (normalized.includes('coupon_15') || normalized.includes('coupon_20')) {
    score += 0.14;
  }
  if (normalized.includes('transfer')) {
    score += readNumeric(context.ticket, 0) >= 0.7 ? 0.14 : -0.05;
  }
  if (normalized.includes('audio')) {
    score += context.channel === 'email' ? -0.12 : 0.08;
  }
  if (normalized.includes('text')) {
    score += context.channel === 'email' ? 0.06 : 0.01;
  }
  if (normalized.includes('highest_margin') || normalized.includes('premium')) {
    score += 0.08;
  }
  if (normalized.includes('entry') || normalized.includes('top_seller')) {
    score += 0.04;
  }
  if (normalized.includes('tomorrow_9h')) {
    score += 0.03;
  }
  if (normalized.includes('tonight') || normalized.includes('friday')) {
    score += 0.05;
  }
  return clampNumber(score, 0, 1);
}

function readNumeric(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
