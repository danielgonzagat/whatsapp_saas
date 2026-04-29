/**
 * Directive and decision helpers: unit selection, ranking, cost scoring,
 * adaptive retry, prompt building, and deterministic/planner decision makers.
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { buildArtifactRegistry } from './artifact-registry';
import { ensureDir, renamePath, writeTextFile } from './safe-fs';
import type { PulseAutonomyState, PulseAutonomyUnitSnapshot } from './types';
import {
  DEFAULT_VALIDATION_COMMANDS,
  type PulseAutonomousDirective,
  type PulseAutonomousDirectiveUnit,
  type PulseAutonomyDecision,
  type PulseAutonomySummarySnapshot,
} from './autonomy-types';
import { compact, unique, readOptionalArtifact } from './autonomy-memory';
import {
  getStalledUnitIds,
  hasAdaptiveRetryBeenExhausted,
  extractMissingStructuralRoles,
  compareAutomationUnits,
  isRiskSafeForAutomation,
  getAutomationExecutionCost,
} from './autonomy-decision-ranking';

export {
  getPriorityRank,
  getRiskRank,
  getEvidenceRank,
  getConfidenceRank,
  getKindExecutionPenalty,
  getAutomationExecutionCost,
  getStalledUnitIds,
  getUnitHistory,
  hasAdaptiveRetryBeenExhausted,
  extractMissingStructuralRoles,
  compareAutomationUnits,
  isRiskSafeForAutomation,
} from './autonomy-decision-ranking';

export function deriveRequiredValidations(
  unit: Partial<PulseAutonomousDirectiveUnit>,
): Array<
  'typecheck' | 'affected-tests' | 'flow-evidence' | 'scenario-evidence' | 'browser-evidence'
> {
  const required = new Set<
    'typecheck' | 'affected-tests' | 'flow-evidence' | 'scenario-evidence' | 'browser-evidence'
  >(['typecheck', 'affected-tests']);

  if (unit.kind === 'scenario') {
    required.add('scenario-evidence');
  }

  const gateNames = unit.gateNames ?? [];
  if (gateNames.some((g) => g === 'customerPass' || g === 'operatorPass' || g === 'adminPass')) {
    required.add('scenario-evidence');
  }

  const caps = unit.affectedCapabilities ?? [];
  const runtimeCriticalPatterns = [
    'payment',
    'ledger',
    'wallet',
    'billing',
    'checkout',
    'auth',
    'whatsapp',
    'inbox',
  ];
  if (caps.some((c) => runtimeCriticalPatterns.some((p) => c.toLowerCase().includes(p)))) {
    required.add('flow-evidence');
  }

  return Array.from(required);
}

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
    ...(directive.pulseMachineNextWork || []),
    ...(directive.nextAutonomousUnits || []),
    ...(directive.nextExecutableUnits || []),
  ].filter((unit) => {
    if (seen.has(unit.id)) return false;
    seen.add(unit.id);
    return true;
  });
  for (const unit of units) {
    unit.requiredValidations = deriveRequiredValidations(unit);
  }
  return units.filter((unit) => unit.executionMode === 'ai_safe');
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
    'Work autonomously inside the current repository until this convergence unit is materially improved or you hit a real blocker. Obey AGENTS.md and every governance boundary. Never weaken governance or fake completion. Focus on this unit only. Use the assigned sandbox and owned surfaces for edits, gather observation_only evidence read-only, run the validation needed for the touched surfaces, and leave the repo in a better state. Treat legacy protected-surface labels as PULSE governance signals to reduce with safe evidence or scoped implementation when possible; switch to observation_only or governed sandbox validation on real governance, secrets, production-write, or permission boundaries. At the end, return a concise summary of edits, validation, and remaining blockers.';
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
  const required = unit.requiredValidations ?? [];
  if (required.length > 0) {
    return unique(required.filter(Boolean));
  }
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
