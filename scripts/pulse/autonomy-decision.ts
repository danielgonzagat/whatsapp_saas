/**
 * Directive and decision helpers: unit selection, ranking, cost scoring,
 * adaptive retry, prompt building, and deterministic/planner decision makers.
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { buildArtifactRegistry } from './artifact-registry';
import { ensureDir, renamePath, writeTextFile } from './safe-fs';
import type {
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyUnitSnapshot,
} from './types';
import {
  DEFAULT_VALIDATION_COMMANDS,
  type PulseAutonomousDirective,
  type PulseAutonomousDirectiveUnit,
  type PulseAutonomyDecision,
  type PulseAutonomySummarySnapshot,
} from './autonomy-types';
import { compact, unique, readOptionalArtifact, getAutonomyArtifactPath } from './autonomy-memory';

export function writeAtomicArtifact(targetPath: string, rootDir: string, content: string): void {
  const registry = buildArtifactRegistry(rootDir);
  ensureDir(path.dirname(targetPath), { recursive: true });
  ensureDir(registry.tempDir, { recursive: true });
  const tempPath = path.join(
    registry.tempDir,
    `${path.basename(targetPath)}.${Date.now().toString(36)}.tmp`,
  );
  writeTextFile(tempPath, content);
  renamePath(tempPath, targetPath);
}

export function directiveDigest(directive: PulseAutonomousDirective): string {
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        currentCheckpoint: directive.currentCheckpoint || null,
        currentState: directive.currentState || null,
        visionGap: directive.visionGap || null,
        nextExecutableUnits: directive.nextExecutableUnits || [],
        blockedUnits: directive.blockedUnits || [],
      }),
    )
    .digest('hex');
}

export function getDirectiveSnapshot(
  directive: PulseAutonomousDirective,
): PulseAutonomySummarySnapshot {
  return {
    certificationStatus: directive.currentState?.certificationStatus || null,
    blockingTier:
      typeof directive.currentState?.blockingTier === 'number'
        ? directive.currentState.blockingTier
        : null,
    score: typeof directive.currentState?.score === 'number' ? directive.currentState.score : null,
    visionGap: directive.visionGap || null,
  };
}

export function toUnitSnapshot(
  unit: PulseAutonomousDirectiveUnit | null,
): PulseAutonomyUnitSnapshot | null {
  if (!unit) return null;
  return {
    id: unit.id,
    kind: unit.kind,
    priority: unit.priority,
    executionMode: unit.executionMode,
    title: unit.title,
    summary: unit.summary,
    affectedCapabilities: unit.affectedCapabilities || [],
    affectedFlows: unit.affectedFlows || [],
    validationTargets: unique([
      ...(unit.validationTargets || []),
      ...(unit.validationArtifacts || []),
      ...(unit.exitCriteria || []),
    ]),
  };
}

export function getAiSafeUnits(
  directive: PulseAutonomousDirective,
): PulseAutonomousDirectiveUnit[] {
  const seen = new Set<string>();
  const units = [
    ...(directive.nextAutonomousUnits || []),
    ...(directive.nextExecutableUnits || []),
  ].filter((unit) => {
    if (seen.has(unit.id)) return false;
    seen.add(unit.id);
    return true;
  });
  return units.filter((unit) => unit.executionMode === 'ai_safe');
}
function getPriorityRank(priority: string): number {
  if (priority === 'P0') return 0;
  if (priority === 'P1') return 1;
  if (priority === 'P2') return 2;
  return 3;
}
function getRiskRank(riskLevel: string): number {
  const n = String(riskLevel || '')
    .trim()
    .toLowerCase();
  if (n === 'critical') return 3;
  if (n === 'high') return 2;
  if (n === 'medium') return 1;
  return 0;
}
function getEvidenceRank(evidenceMode: string): number {
  if (evidenceMode === 'observed') return 0;
  if (evidenceMode === 'inferred') return 1;
  return 2;
}
function getConfidenceRank(confidence: string): number {
  const n = String(confidence || '')
    .trim()
    .toLowerCase();
  if (n === 'high') return 3;
  if (n === 'medium') return 2;
  if (n === 'low') return 1;
  const numeric = Number.parseFloat(n);
  return Number.isFinite(numeric) ? numeric : 0;
}
function getKindExecutionPenalty(unit: PulseAutonomousDirectiveUnit): number {
  if (unit.kind === 'capability') return 0;
  if (unit.kind === 'flow') return 4;
  if (unit.kind === 'scope' || unit.kind === 'gate' || unit.kind === 'static') return 7;
  if (unit.kind === 'runtime' || unit.kind === 'change' || unit.kind === 'dependency') return 9;
  if (unit.kind === 'scenario') return 12;
  return 6;
}
function getAutomationExecutionCost(unit: PulseAutonomousDirectiveUnit): number {
  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  const validationCount = unique([
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]).length;
  const routePenalty = unit.kind === 'scenario' ? Math.max(0, capabilityCount - 2) * 3 : 0;
  return (
    getKindExecutionPenalty(unit) +
    capabilityCount * 3 +
    flowCount * 4 +
    validationCount +
    routePenalty +
    getRiskRank(unit.riskLevel) * 2 +
    getEvidenceRank(unit.evidenceMode)
  );
}

function getStalledUnitIds(previousState?: PulseAutonomyState | null): Set<string> {
  const stalled = new Set<string>();
  const attempts = new Map<string, { attempts: number; stalled: number }>();
  for (const record of (previousState?.history || []).slice(-8)) {
    if (record.codex.executed === false && record.validation.executed === false) continue;
    const unitId = record.unit?.id;
    if (!unitId) continue;
    const current = attempts.get(unitId) || { attempts: 0, stalled: 0 };
    current.attempts += 1;
    const didImprove =
      record.improved === true ||
      (record.directiveDigestBefore !== null &&
        record.directiveDigestAfter !== null &&
        record.directiveDigestBefore !== record.directiveDigestAfter) ||
      (typeof record.directiveBefore?.score === 'number' &&
        typeof record.directiveAfter?.score === 'number' &&
        record.directiveAfter.score > record.directiveBefore.score) ||
      (record.directiveBefore?.blockingTier !== null &&
        record.directiveAfter?.blockingTier !== null &&
        record.directiveAfter.blockingTier < record.directiveBefore.blockingTier);
    if (!didImprove) current.stalled += 1;
    attempts.set(unitId, current);
  }
  for (const [unitId, summary] of attempts.entries()) {
    if (summary.attempts >= 2 && summary.stalled >= 2) stalled.add(unitId);
  }
  return stalled;
}
function getUnitHistory(
  previousState: PulseAutonomyState | null | undefined,
  unitId: string,
): PulseAutonomyIterationRecord[] {
  return (previousState?.history || []).filter((r) => r.unit?.id === unitId);
}
function hasAdaptiveRetryBeenExhausted(
  previousState: PulseAutonomyState | null | undefined,
  unitId: string,
): boolean {
  const history = getUnitHistory(previousState, unitId);
  const last = history[history.length - 1];
  return Boolean(last && last.strategyMode === 'adaptive_narrow_scope' && last.improved === false);
}
function extractMissingStructuralRoles(summary: string): string[] {
  const match = summary.match(/Missing structural roles:\s*([^.;]+)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function compareAutomationUnits(
  left: PulseAutonomousDirectiveUnit,
  right: PulseAutonomousDirectiveUnit,
): number {
  const costDelta = getAutomationExecutionCost(left) - getAutomationExecutionCost(right);
  if (costDelta !== 0) return costDelta;
  const priorityDelta = getPriorityRank(left.priority) - getPriorityRank(right.priority);
  if (priorityDelta !== 0) return priorityDelta;
  const confidenceDelta = getConfidenceRank(right.confidence) - getConfidenceRank(left.confidence);
  if (confidenceDelta !== 0) return confidenceDelta;
  return left.title.localeCompare(right.title);
}
function isRiskSafeForAutomation(
  unit: PulseAutonomousDirectiveUnit,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): boolean {
  if (riskProfile === 'dangerous') return true;
  const risk = String(unit.riskLevel || '')
    .trim()
    .toLowerCase();
  if (risk === 'critical' || (riskProfile === 'safe' && risk === 'high')) return false;
  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  return riskProfile === 'safe'
    ? capabilityCount <= 8 && flowCount <= 2
    : capabilityCount <= 12 && flowCount <= 4;
}
export function getAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): PulseAutonomousDirectiveUnit[] {
  const units = getAiSafeUnits(directive).filter((unit) =>
    isRiskSafeForAutomation(unit, riskProfile),
  );
  return directive.nextAutonomousUnits && directive.nextAutonomousUnits.length > 0
    ? units
    : units.sort(compareAutomationUnits);
}

export function getFreshAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const ranked = getAutomationSafeUnits(directive, riskProfile);
  const stalledUnitIds = getStalledUnitIds(previousState);
  return ranked.filter((unit) => !stalledUnitIds.has(unit.id));
}

export function getPreferredAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const fresh = getFreshAutomationSafeUnits(directive, riskProfile, previousState);
  return fresh.length > 0 ? fresh : getAutomationSafeUnits(directive, riskProfile);
}

export function normalizeValidationCommands(
  commands: string[],
  directive: PulseAutonomousDirective,
): string[] {
  if (commands.length > 0) return unique(commands.filter(Boolean));
  const suggested = directive.suggestedValidation?.commands || [];
  if (suggested.length > 0) return unique(suggested.filter(Boolean));
  return DEFAULT_VALIDATION_COMMANDS;
}

export function buildCodexPrompt(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  customPrompt?: string,
): string {
  const unitValidationTargets = unique([
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]);
  const instructionLines = [
    `Primary convergence unit: ${unit.title}`,
    `Unit id: ${unit.id}`,
    `Kind: ${unit.kind}`,
    `Priority: ${unit.priority}`,
    `Product impact: ${unit.productImpact}`,
    `Owner lane: ${unit.ownerLane}`,
    `Why now: ${compact(unit.whyNow || unit.visionDelta || unit.summary, 500)}`,
    `Summary: ${compact(unit.summary, 500)}`,
    `Affected capabilities: ${(unit.affectedCapabilities || []).join(', ') || 'none'}`,
    `Affected flows: ${(unit.affectedFlows || []).join(', ') || 'none'}`,
    `Validation targets: ${unitValidationTargets.join(' | ') || 'follow PULSE suggested validation'}`,
    `Current vision gap: ${compact(directive.visionGap || 'unknown', 400)}`,
    `Top blockers: ${(directive.topBlockers || []).slice(0, 5).join(' | ') || 'none'}`,
    `Do not touch surfaces: ${(directive.doNotTouchSurfaces || []).join(', ') || 'none'}`,
    `Anti-goals: ${(directive.antiGoals || []).join(' | ') || 'none'}`,
  ];
  const enforcedHeader =
    'Work autonomously inside the current repository until this convergence unit is materially improved or you hit a real blocker. Obey AGENTS.md and every governance boundary. Never weaken governance or fake completion. Focus on this unit only. Make real code changes, run the validation needed for the touched surfaces, and leave the repo in a better state. Do not touch human_required or observation_only surfaces. At the end, return a concise summary of edits, validation, and remaining blockers.';
  if (customPrompt && customPrompt.trim().length > 0)
    return [enforcedHeader, '', customPrompt.trim(), '', ...instructionLines].join('\n');
  return [enforcedHeader, '', ...instructionLines].join('\n');
}

export function buildAdaptivePrompt(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  customPrompt?: string,
): string {
  const missingRoles = extractMissingStructuralRoles(unit.summary);
  const primaryRole = missingRoles[0];
  const narrowedInstructions: string[] = [
    'Adaptive retry is active because this unit stalled in previous iterations.',
    'Do not attempt to fully complete the entire unit in one pass.',
  ];
  if (customPrompt && customPrompt.trim().length > 0)
    narrowedInstructions.push(customPrompt.trim());
  if (primaryRole) {
    narrowedInstructions.push(
      `Focus only on materializing the missing structural role "${primaryRole}" for this unit.`,
    );
  } else if (unit.kind === 'scenario') {
    narrowedInstructions.push(
      'Focus only on the first missing executable step in the scenario chain and leave other gaps untouched.',
    );
  } else {
    narrowedInstructions.push(
      'Focus only on the smallest real code change that reduces the structural gap for this unit.',
    );
  }
  narrowedInstructions.push(
    'Prefer one narrow, validated improvement over a wide incomplete refactor.',
    'If the smallest useful change is impossible without broader work, stop and explain the exact blocker rather than widening scope.',
  );
  return buildCodexPrompt(directive, unit, narrowedInstructions.join(' '));
}

export function buildDeterministicDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomyDecision {
  const unit = getFreshAutomationSafeUnits(directive, riskProfile, previousState)[0];
  if (!unit) {
    const stalledCandidates = getAutomationSafeUnits(directive, riskProfile);
    const candidate = stalledCandidates.find(
      (u) => !hasAdaptiveRetryBeenExhausted(previousState, u.id),
    );
    if (!candidate) {
      return {
        shouldContinue: false,
        selectedUnitId: '',
        rationale:
          'Only previously stalled automation-safe units remain, and adaptive narrow-scope retries are already exhausted.',
        codexPrompt: '',
        validationCommands,
        stopReason:
          'Only previously stalled automation-safe units remain and the adaptive retry path is exhausted.',
        strategyMode: 'adaptive_narrow_scope',
      };
    }
    return {
      shouldContinue: true,
      selectedUnitId: candidate.id,
      rationale:
        'Only stalled automation-safe work remains, so the loop is retrying with a narrower adaptive scope.',
      codexPrompt: buildAdaptivePrompt(directive, candidate),
      validationCommands: buildUnitValidationCommands(directive, candidate, validationCommands),
      stopReason: '',
      strategyMode: 'adaptive_narrow_scope',
    };
  }
  return {
    shouldContinue: true,
    selectedUnitId: unit.id,
    rationale:
      'Selected the highest-ranked ai_safe unit from the PULSE decision queue as a deterministic fallback.',
    codexPrompt: buildCodexPrompt(directive, unit),
    validationCommands: buildUnitValidationCommands(directive, unit, validationCommands),
    stopReason: '',
    strategyMode: 'normal',
  };
}

export function buildUnitValidationCommands(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  fallbackCommands: string[],
): string[] {
  const suggestedCommands = directive.suggestedValidation?.commands || [];
  const candidates = unique([...suggestedCommands, ...fallbackCommands]);
  return candidates.length > 0 ? candidates : DEFAULT_VALIDATION_COMMANDS;
}

export function readDirectiveArtifact(rootDir: string): PulseAutonomousDirective | null {
  const canonicalPath = path.join(rootDir, '.pulse', 'current', 'PULSE_CLI_DIRECTIVE.json');
  const mirrorPath = path.join(rootDir, 'PULSE_CLI_DIRECTIVE.json');
  return (
    readOptionalArtifact<PulseAutonomousDirective>(canonicalPath) ||
    readOptionalArtifact<PulseAutonomousDirective>(mirrorPath)
  );
}
