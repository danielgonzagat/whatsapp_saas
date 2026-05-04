import { spawnSync } from 'node:child_process';
import type { PulseAutonomyState } from '../../types';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { compact } from '../../autonomy-loop.utils';
import { getPreferredAutomationSafeUnits, hasUnitConflict } from '../../autonomy-loop.unit-ranking';
import { readDirectiveArtifact } from './directive';
import {
  readQueueInfluence,
  readAutonomyMemoryConcepts,
  unitIsBlockedByMemory,
} from './queue-influence';

export function getMemoryAwarePreferredAutomationSafeUnits(
  rootDir: string,
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
  plannerMode: 'agents_sdk' | 'deterministic' = 'deterministic',
  strategyMode: 'normal' | 'adaptive_narrow_scope' = 'normal',
): PulseAutonomousDirectiveUnit[] {
  const structuralInfluence = readQueueInfluence(rootDir, directive);
  const autonomyConcepts = readAutonomyMemoryConcepts(rootDir, previousState);
  const currentStrategy = `${strategyMode}_${plannerMode}`;

  return getPreferredAutomationSafeUnits(
    directive,
    riskProfile,
    previousState,
    structuralInfluence,
  ).filter(
    (unit) =>
      !unitIsBlockedByMemory(unit.id, structuralInfluence, autonomyConcepts, currentStrategy),
  );
}

export function selectMemoryAwareParallelUnits(
  rootDir: string,
  directive: PulseAutonomousDirective,
  parallelAgents: number,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
  plannerMode: 'agents_sdk' | 'deterministic' = 'deterministic',
  strategyMode: 'normal' | 'adaptive_narrow_scope' = 'normal',
): PulseAutonomousDirectiveUnit[] {
  const preferredUnits = getMemoryAwarePreferredAutomationSafeUnits(
    rootDir,
    directive,
    riskProfile,
    previousState,
    plannerMode,
    strategyMode,
  );
  if (parallelAgents <= 1 || preferredUnits.length <= 1) {
    return preferredUnits.slice(0, 1);
  }

  const selected: PulseAutonomousDirectiveUnit[] = [];
  for (const unit of preferredUnits) {
    if (selected.length >= parallelAgents) break;
    if (selected.length === 0 || !hasUnitConflict(unit, selected)) {
      selected.push(unit);
    }
  }

  return selected.length > 0 ? selected : preferredUnits.slice(0, 1);
}

export function runPulseGuidance(rootDir: string): PulseAutonomousDirective {
  const result = spawnSync('node', ['scripts/pulse/run.js', '--guidance'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(compact(result.stderr || result.stdout || 'PULSE guidance failed.', 800));
  }

  const directive = readDirectiveArtifact(rootDir);
  if (!directive) {
    throw new Error('PULSE guidance finished but did not leave a canonical directive artifact.');
  }

  return directive;
}
