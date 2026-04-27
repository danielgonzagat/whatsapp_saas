/**
 * Prompt building functions for the autonomy loop.
 * Produces prompts for Codex and the planner agent.
 */
import type { PulseAutonomyState, PulseAutonomyUnitSnapshot } from './types';
import type { PulseAutonomousDirective, PulseAutonomousDirectiveUnit } from './autonomy-loop.types';
import { DEFAULT_VALIDATION_COMMANDS } from './autonomy-loop.types';
import { compact, unique } from './autonomy-loop.utils';
import {
  getPreferredAutomationSafeUnits,
  getFreshAutomationSafeUnits,
  getAutomationSafeUnits,
  hasAdaptiveRetryBeenExhausted,
} from './autonomy-loop.unit-ranking';

function extractMissingStructuralRoles(summary: string): string[] {
  const match = summary.match(/Missing structural roles:\s*([^.;]+)/i);
  if (!match) {
    return [];
  }

  return match[1]
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
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

  const enforcedHeader = [
    'Work autonomously inside the current repository until this convergence unit is materially improved or you hit a real blocker.',
    'Obey AGENTS.md and every governance boundary. Never weaken governance or fake completion.',
    'Focus on this unit only. Make real code changes, run the validation needed for the touched surfaces, and leave the repo in a better state.',
    'Do not touch human_required or observation_only surfaces.',
    'At the end, return a concise summary of edits, validation, and remaining blockers.',
  ].join(' ');

  if (customPrompt && customPrompt.trim().length > 0) {
    return [enforcedHeader, '', customPrompt.trim(), '', ...instructionLines].join('\n');
  }

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

  if (customPrompt && customPrompt.trim().length > 0) {
    narrowedInstructions.push(customPrompt.trim());
  }

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

export function buildWorkerPrompt(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  workerOrdinal: number,
  totalWorkers: number,
): string {
  const coordinationHeader = [
    `You are worker ${workerOrdinal} of ${totalWorkers} in a coordinated Codex batch.`,
    'You are running inside an isolated worker workspace that will be reconciled back into the main repository only if your patch applies cleanly.',
    'Stay inside the surfaces assigned to this unit.',
    'Do not expand scope into other queued units, even if you notice adjacent work.',
    'Assume other workers are operating in parallel; do not revert edits made by others.',
    'If the repo state changes under you, adapt safely and keep the convergence unit isolated.',
  ].join(' ');

  return buildCodexPrompt(directive, unit, coordinationHeader);
}

export function normalizeValidationCommands(
  commands: string[],
  directive: PulseAutonomousDirective,
): string[] {
  if (commands.length > 0) {
    return unique(commands.filter(Boolean));
  }
  const suggested = directive.suggestedValidation?.commands || [];
  if (suggested.length > 0) {
    return unique(suggested.filter(Boolean));
  }
  return DEFAULT_VALIDATION_COMMANDS;
}

export function buildBatchValidationCommands(
  directive: PulseAutonomousDirective,
  units: PulseAutonomousDirectiveUnit[],
  fallbackCommands: string[],
): string[] {
  const commands = normalizeValidationCommands(fallbackCommands, directive);
  const allTargets = units.flatMap((unit) => [
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]);
  const gateNames = units.flatMap((unit) => unit.gateNames || []);
  const scenarioIds = units.flatMap((unit) => unit.scenarioIds || []);
  const actorFlags = new Set<string>();

  for (const scenarioId of scenarioIds) {
    if (scenarioId.startsWith('customer-')) {
      actorFlags.add('--customer');
      continue;
    }
    if (scenarioId.startsWith('operator-')) {
      actorFlags.add('--operator');
      continue;
    }
    if (scenarioId.startsWith('admin-')) {
      actorFlags.add('--admin');
    }
  }

  if (gateNames.includes('customerPass')) actorFlags.add('--customer');
  if (gateNames.includes('operatorPass')) actorFlags.add('--operator');
  if (gateNames.includes('adminPass')) actorFlags.add('--admin');

  const needsScenarioValidation =
    units.some((unit) => unit.kind === 'scenario') ||
    gateNames.includes('browserPass') ||
    gateNames.includes('customerPass') ||
    gateNames.includes('operatorPass') ||
    gateNames.includes('adminPass') ||
    allTargets.some((target) => target.includes('PULSE_SCENARIO_COVERAGE'));
  const needsRuntimeValidation = allTargets.some(
    (target) =>
      target.includes('PULSE_RUNTIME_EVIDENCE') ||
      target.includes('PULSE_WORLD_STATE') ||
      target.includes('PULSE_FLOW_EVIDENCE') ||
      target.includes('PULSE_CUSTOMER_EVIDENCE') ||
      target.includes('PULSE_RUNTIME_PROBES'),
  );
  const needsBrowserValidation = allTargets.some(
    (target) =>
      target.includes('PULSE_BROWSER_EVIDENCE') || target.includes('Browser-required routes'),
  );

  if (needsScenarioValidation && actorFlags.size > 0) {
    commands.push(`node scripts/pulse/run.js ${Array.from(actorFlags).join(' ')} --fast --json`);
  } else if (needsScenarioValidation) {
    commands.push('node scripts/pulse/run.js --customer --operator --admin --fast --json');
  } else if (needsRuntimeValidation || needsBrowserValidation) {
    commands.push('node scripts/pulse/run.js --deep --fast --json');
  }

  commands.push('node scripts/pulse/run.js --guidance');
  return unique(commands);
}

export function buildUnitValidationCommands(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  fallbackCommands: string[],
): string[] {
  // Use requiredValidations if populated by the planner
  const required = unit.requiredValidations ?? [];
  if (required.length > 0) {
    const commands: string[] = [];
    for (const category of new Set(required)) {
      switch (category) {
        case 'typecheck':
          commands.push('npm run typecheck');
          break;
        case 'affected-tests':
          commands.push('npx jest --findRelatedTests --passWithNoTests');
          break;
        case 'flow-evidence':
          if (unit.affectedFlows && unit.affectedFlows.length > 0) {
            commands.push(
              `node scripts/pulse/run.js --deep --flow=${unit.affectedFlows.join(',')} --fast --json`,
            );
          } else {
            commands.push('node scripts/pulse/run.js --deep --fast --json');
          }
          break;
        case 'scenario-evidence':
          if (unit.scenarioIds && unit.scenarioIds.length > 0) {
            for (const sid of unit.scenarioIds) {
              commands.push(
                `npm --prefix e2e exec playwright test specs/${sid}.spec.ts --pass-with-no-tests`,
              );
            }
          } else {
            commands.push('npm --prefix e2e exec playwright test --pass-with-no-tests');
          }
          break;
        case 'browser-evidence':
          commands.push('node scripts/pulse/run.js --deep --customer --operator --admin --fast');
          break;
      }
    }
    return unique(commands.filter(Boolean));
  }
  return buildBatchValidationCommands(directive, [unit], fallbackCommands);
}

export function buildPlannerPrompt(
  directive: PulseAutonomousDirective,
  previousState: PulseAutonomyState | null,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): string {
  const aiSafeUnits = getPreferredAutomationSafeUnits(directive, riskProfile, previousState)
    .slice(0, 8)
    .map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      priority: unit.priority,
      productImpact: unit.productImpact,
      ownerLane: unit.ownerLane,
      title: unit.title,
      summary: unit.summary,
      whyNow: unit.whyNow || unit.visionDelta || '',
      affectedCapabilities: unit.affectedCapabilities || [],
      affectedFlows: unit.affectedFlows || [],
      validationTargets: unique([
        ...(unit.validationTargets || []),
        ...(unit.validationArtifacts || []),
      ]).slice(0, 6),
    }));

  return JSON.stringify(
    {
      currentCheckpoint: directive.currentCheckpoint || null,
      currentState: directive.currentState || null,
      visionGap: directive.visionGap || null,
      topBlockers: (directive.topBlockers || []).slice(0, 8),
      topProblems: (directive.topProblems || []).slice(0, 8),
      stopCondition: directive.stopCondition || [],
      doNotTouchSurfaces: directive.doNotTouchSurfaces || [],
      antiGoals: directive.antiGoals || [],
      suggestedValidation: directive.suggestedValidation?.commands || [],
      candidateUnits: aiSafeUnits,
      previousAutonomyState: previousState
        ? {
            status: previousState.status,
            completedIterations: previousState.completedIterations,
            stopReason: previousState.stopReason,
            nextActionableUnit: previousState.nextActionableUnit,
            recentHistory: previousState.history.slice(-3).map((iteration) => ({
              iteration: iteration.iteration,
              status: iteration.status,
              summary: iteration.summary,
              unit: iteration.unit,
              directiveAfter: iteration.directiveAfter,
            })),
          }
        : null,
    },
    null,
    2,
  );
}

export function summarizeBatchUnits(units: PulseAutonomousDirectiveUnit[]): string {
  return units.map((unit) => unit.title).join(' | ');
}

export function buildAdaptiveDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): import('./autonomy-loop.types').PulseAutonomyDecision {
  const stalledCandidates = getAutomationSafeUnits(directive, riskProfile);
  const candidate = stalledCandidates.find(
    (unit) => !hasAdaptiveRetryBeenExhausted(previousState, unit.id),
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

export function buildDeterministicDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): import('./autonomy-loop.types').PulseAutonomyDecision {
  const unit = getFreshAutomationSafeUnits(directive, riskProfile, previousState)[0];
  if (!unit) {
    return buildAdaptiveDecision(directive, validationCommands, riskProfile, previousState);
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

export function coercePlannerDecision(
  value: unknown,
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): import('./autonomy-loop.types').PulseAutonomyDecision {
  const candidate = (value || {}) as Record<string, unknown>;
  const shouldContinue = candidate.shouldContinue === true;
  const selectedUnitId =
    typeof candidate.selectedUnitId === 'string' ? candidate.selectedUnitId : '';
  const rationale = typeof candidate.rationale === 'string' ? candidate.rationale : '';
  const codexPrompt = typeof candidate.codexPrompt === 'string' ? candidate.codexPrompt : '';
  const stopReason = typeof candidate.stopReason === 'string' ? candidate.stopReason : '';
  const commandList = Array.isArray(candidate.validationCommands)
    ? unique(
        candidate.validationCommands.filter((entry): entry is string => typeof entry === 'string'),
      )
    : validationCommands;

  const freshUnit =
    getFreshAutomationSafeUnits(directive, riskProfile, previousState).find(
      (unit) => unit.id === selectedUnitId,
    ) || null;
  const chosenUnit =
    getPreferredAutomationSafeUnits(directive, riskProfile, previousState).find(
      (unit) => unit.id === selectedUnitId,
    ) || null;
  const strategyMode = freshUnit || !chosenUnit ? 'normal' : ('adaptive_narrow_scope' as const);
  if (!shouldContinue || !chosenUnit) {
    return {
      shouldContinue: false,
      selectedUnitId: '',
      rationale:
        rationale ||
        'Planner did not return a valid automation-safe ai_safe unit, so the loop will stop safely.',
      codexPrompt: '',
      validationCommands: commandList,
      stopReason: stopReason || 'Planner did not return a valid automation-safe ai_safe unit.',
      strategyMode: 'normal',
    };
  }

  return {
    shouldContinue: true,
    selectedUnitId: chosenUnit.id,
    rationale: rationale || 'Planner selected the next ai_safe unit from the live PULSE directive.',
    codexPrompt:
      strategyMode === 'adaptive_narrow_scope'
        ? buildAdaptivePrompt(directive, chosenUnit, codexPrompt)
        : buildCodexPrompt(directive, chosenUnit, codexPrompt),
    validationCommands: buildUnitValidationCommands(directive, chosenUnit, commandList),
    stopReason: '',
    strategyMode,
  };
}
