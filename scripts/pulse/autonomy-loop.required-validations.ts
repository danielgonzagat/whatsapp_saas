import type { PulseAutonomousDirectiveUnit } from './autonomy-loop.types';
import type { PulseActorKind, PulseTimeWindowMode } from './types';
import {
  inferSyntheticModeFromToken,
  inferSyntheticModesForScenario,
  inferEvidenceKeyFromFileName,
  isPulseEvidenceFileName,
  readManifestForModeRegistry,
  toSyntheticModeFlag,
  uniqueValues,
} from './scenario-mode-registry';
import type { PulseSyntheticRunMode } from './actors/types';

type RequiredValidationCategory =
  | 'typecheck'
  | 'affected-tests'
  | 'flow-evidence'
  | 'scenario-evidence'
  | 'browser-evidence';

interface ScenarioValidationMetadata {
  id: string;
  actorKind?: PulseActorKind;
  timeWindowModes: PulseTimeWindowMode[];
  playwrightSpecs: string[];
}

function isActorKind(value: unknown): value is PulseActorKind {
  return value === 'customer' || value === 'operator' || value === 'admin' || value === 'system';
}

function isTimeWindowMode(value: unknown): value is PulseTimeWindowMode {
  return value === 'total' || value === 'shift' || value === 'soak';
}

function readScenarioValidationMetadata(): ScenarioValidationMetadata[] {
  const manifest = readManifestForModeRegistry(process.cwd());
  return (manifest?.scenarioSpecs ?? []).map((scenario) => ({
    id: scenario.id,
    actorKind: isActorKind(scenario.actorKind) ? scenario.actorKind : undefined,
    timeWindowModes: scenario.timeWindowModes.filter(isTimeWindowMode),
    playwrightSpecs: scenario.playwrightSpecs,
  }));
}

function getScenarioMetadataById(scenarioIds: string[]): ScenarioValidationMetadata[] {
  const byId = new Map(readScenarioValidationMetadata().map((scenario) => [scenario.id, scenario]));
  return scenarioIds.flatMap((scenarioId) => {
    const scenario = byId.get(scenarioId);
    return scenario ? [scenario] : [];
  });
}

function actorFlagsForUnit(unit: PulseAutonomousDirectiveUnit): string[] {
  const modes = new Set<PulseSyntheticRunMode>();
  const scenarios = getScenarioMetadataById(unit.scenarioIds ?? []);
  for (const scenario of scenarios) {
    inferSyntheticModesForScenario({
      actorKind: scenario.actorKind ?? 'system',
      timeWindowModes: scenario.timeWindowModes,
    }).forEach((mode) => modes.add(mode));
  }

  const hints = [
    ...(unit.gateNames ?? []),
    ...(unit.validationTargets ?? []),
    ...(unit.validationArtifacts ?? []),
    ...(unit.exitCriteria ?? []),
  ].join(' ');
  for (const token of hints.split(/[^A-Za-z0-9_.-]+/).filter(Boolean)) {
    const passMode = inferSyntheticModeFromToken(token);
    if (passMode) {
      modes.add(passMode);
    }
    if (isPulseEvidenceFileName(token)) {
      const evidenceKey = inferEvidenceKeyFromFileName(token);
      if (evidenceKey) {
        modes.add(evidenceKey);
      }
    }
  }
  return uniqueValues([...modes]).map(toSyntheticModeFlag);
}

/**
 * Translate a unit's requiredValidations[] into concrete shell commands.
 * Returns an empty array if the unit has no requiredValidations — caller
 * is expected to fall back to its default command set in that case.
 */
export function buildRequiredValidationCommands(unit: PulseAutonomousDirectiveUnit): string[] {
  const required = (unit.requiredValidations ?? []) as RequiredValidationCategory[];
  if (required.length === 0) {
    return [];
  }
  const commands: string[] = [];
  for (const category of new Set(required)) {
    switch (category) {
      case 'typecheck':
        commands.push('npm run typecheck');
        break;
      case 'affected-tests':
        commands.push(buildAffectedTestsCommand(unit));
        break;
      case 'flow-evidence': {
        const flows = unit.affectedFlows ?? [];
        commands.push(
          flows.length > 0
            ? `node scripts/pulse/run.js --deep --flow=${flows.join(',')} --fast --json`
            : 'node scripts/pulse/run.js --deep --fast --json',
        );
        break;
      }
      case 'scenario-evidence': {
        const playwrightSpecs = getScenarioMetadataById(unit.scenarioIds ?? []).flatMap(
          (scenario) => scenario.playwrightSpecs,
        );
        if (playwrightSpecs.length > 0) {
          commands.push(
            `npm --prefix e2e exec playwright test ${[...new Set(playwrightSpecs)]
              .map(shellQuote)
              .join(' ')} --pass-with-no-tests`,
          );
          break;
        }
        const actorFlags = actorFlagsForUnit(unit);
        commands.push(
          actorFlags.length > 0
            ? `node scripts/pulse/run.js ${actorFlags.join(' ')} --fast --json`
            : 'node scripts/pulse/run.js --deep --fast --json',
        );
        break;
      }
      case 'browser-evidence': {
        const actorFlags = actorFlagsForUnit(unit);
        commands.push(
          actorFlags.length > 0
            ? `node scripts/pulse/run.js --deep ${actorFlags.join(' ')} --fast`
            : 'node scripts/pulse/run.js --deep --fast',
        );
        break;
      }
    }
  }
  return commands;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function unitRelatedSourceFiles(unit: PulseAutonomousDirectiveUnit): string[] {
  return [
    ...(unit.ownedFiles || []),
    ...(unit.relatedFiles || []),
    ...(unit.validationTargets || []),
  ]
    .filter((filePath) => /\.(ts|tsx|js|jsx)$/.test(filePath))
    .filter((filePath) => !filePath.includes('__tests__'))
    .filter((filePath) => !/[.]spec[.]|[.]test[.]/.test(filePath));
}

function buildAffectedTestsCommand(unit: PulseAutonomousDirectiveUnit): string {
  const files = [...new Set(unitRelatedSourceFiles(unit))];
  if (files.length === 0) {
    return [
      'npx vitest run',
      'scripts/pulse/__tests__/multi-cycle-convergence.spec.ts',
      'scripts/pulse/__tests__/regression-guard.spec.ts',
      'scripts/pulse/__tests__/execution-matrix.spec.ts',
    ].join(' ');
  }
  return `npx jest --findRelatedTests ${files.map(shellQuote).join(' ')} --passWithNoTests`;
}
