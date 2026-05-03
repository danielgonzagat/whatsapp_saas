import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { compact, unique } from '../../autonomy-loop.utils';
import { extractMissingStructuralRoles } from './scenario-metadata';

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
    `Lease id: ${unit.leaseId || 'missing'}`,
    `Lease status: ${unit.leaseStatus || 'missing'}`,
    `Lease expires at: ${unit.leaseExpiresAt || 'missing'}`,
    `Context digest: ${unit.contextDigest || directive.contextFabric?.contextDigest || 'missing'}`,
    `Owned files: ${(unit.ownedFiles || []).join(', ') || 'none'}`,
    `Read-only files: ${(unit.readOnlyFiles || []).join(', ') || 'none'}`,
    `Forbidden files: ${(unit.forbiddenFiles || directive.doNotTouchSurfaces || []).join(', ') || 'none'}`,
    `Validation targets: ${unitValidationTargets.join(' | ') || 'follow PULSE suggested validation'}`,
    `Current vision gap: ${compact(directive.visionGap || 'unknown', 400)}`,
    `Top blockers: ${(directive.topBlockers || []).slice(0, 5).join(' | ') || 'none'}`,
    `Do not touch surfaces: ${(directive.doNotTouchSurfaces || []).join(', ') || 'none'}`,
    `Anti-goals: ${(directive.antiGoals || []).join(' | ') || 'none'}`,
  ];
  const enforcedHeader =
    'Work autonomously inside the current repository until this convergence unit is materially improved or you hit a real blocker. Obey AGENTS.md and every governance boundary. Never weaken governance or fake completion. Focus on this unit only. Use the assigned sandbox and owned surfaces for edits, gather observation_only evidence read-only, run the validation needed for the touched surfaces, and leave the repo in a better state. Treat legacy protected-surface labels as PULSE governance signals to reduce with safe evidence or scoped implementation when possible; switch to observation_only or governed sandbox validation on real governance, secrets, production-write, or permission boundaries. At the end, return a concise summary of edits, validation, and remaining blockers.';
  const unitSpecificHeader =
    unit.id === 'gate-multi-cycle-convergence-pass'
      ? 'This unit is a convergence-proof unit, not a product-feature repair. Do not edit product code unless validation exposes a concrete PULSE infrastructure defect. Do not run `node scripts/pulse/run.js --autonomous` or spawn another autonomous loop from inside this cycle. If no patch is needed, leave files unchanged and report the exact validation evidence that should count for this cycle.'
      : '';
  if (customPrompt && customPrompt.trim().length > 0)
    return [enforcedHeader, unitSpecificHeader, '', customPrompt.trim(), '', ...instructionLines]
      .filter((line) => line !== '')
      .join('\n');
  return [enforcedHeader, unitSpecificHeader, '', ...instructionLines]
    .filter((line) => line !== '')
    .join('\n');
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
  if (primaryRole)
    narrowedInstructions.push(
      `Focus only on materializing the missing structural role "${primaryRole}" for this unit.`,
    );
  else if (unit.kind === 'scenario')
    narrowedInstructions.push(
      'Focus only on the first missing executable step in the scenario chain and leave other gaps untouched.',
    );
  else
    narrowedInstructions.push(
      'Focus only on the smallest real code change that reduces the structural gap for this unit.',
    );
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
  const coordinationHeader = `You are worker ${workerOrdinal} of ${totalWorkers} in a coordinated Codex batch. You are running inside an isolated worker workspace that will be reconciled back into the main repository only if your patch applies cleanly. Stay inside the surfaces assigned to this unit. Do not expand scope into other queued units, even if you notice adjacent work. Assume other workers are operating in parallel; do not revert edits made by others. If the repo state changes under you, adapt safely and keep the convergence unit isolated.`;
  return buildCodexPrompt(directive, unit, coordinationHeader);
}
