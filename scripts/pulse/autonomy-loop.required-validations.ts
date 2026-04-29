import type { PulseAutonomousDirectiveUnit } from './autonomy-loop.types';
import * as fs from 'node:fs';
import * as path from 'node:path';

type RequiredValidationCategory =
  | 'typecheck'
  | 'affected-tests'
  | 'flow-evidence'
  | 'scenario-evidence'
  | 'browser-evidence';

type SyntheticActorFlag = '--customer' | '--operator' | '--admin' | '--shift' | '--soak';

interface ScenarioValidationMetadata {
  id: string;
  actorKind?: string;
  timeWindowModes: string[];
  playwrightSpecs: string[];
}

function readScenarioValidationMetadata(): ScenarioValidationMetadata[] {
  const candidates = [
    path.join(process.cwd(), '.pulse', 'current', 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(process.cwd(), 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(process.cwd(), 'pulse.manifest.json'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
        scenarioSpecs?: unknown;
      };
      if (!Array.isArray(parsed.scenarioSpecs)) {
        continue;
      }
      return parsed.scenarioSpecs
        .filter((entry): entry is Record<string, unknown> => {
          return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);
        })
        .flatMap((entry) => {
          if (typeof entry.id !== 'string') {
            return [];
          }
          return [
            {
              id: entry.id,
              actorKind: typeof entry.actorKind === 'string' ? entry.actorKind : undefined,
              timeWindowModes: Array.isArray(entry.timeWindowModes)
                ? entry.timeWindowModes.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : [],
              playwrightSpecs: Array.isArray(entry.playwrightSpecs)
                ? entry.playwrightSpecs.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : [],
            },
          ];
        });
    } catch {
      continue;
    }
  }
  return [];
}

function getScenarioMetadataById(scenarioIds: string[]): ScenarioValidationMetadata[] {
  const byId = new Map(readScenarioValidationMetadata().map((scenario) => [scenario.id, scenario]));
  return scenarioIds.flatMap((scenarioId) => {
    const scenario = byId.get(scenarioId);
    return scenario ? [scenario] : [];
  });
}

function actorFlagsForUnit(unit: PulseAutonomousDirectiveUnit): SyntheticActorFlag[] {
  const flags = new Set<SyntheticActorFlag>();
  const scenarios = getScenarioMetadataById(unit.scenarioIds ?? []);
  for (const scenario of scenarios) {
    if (scenario.actorKind === 'customer') flags.add('--customer');
    if (scenario.actorKind === 'operator') flags.add('--operator');
    if (scenario.actorKind === 'admin') flags.add('--admin');
    if (scenario.timeWindowModes.includes('shift')) flags.add('--shift');
    if (scenario.timeWindowModes.includes('soak') || scenario.actorKind === 'system') {
      flags.add('--soak');
    }
  }

  const hints = [
    ...(unit.gateNames ?? []),
    ...(unit.validationTargets ?? []),
    ...(unit.validationArtifacts ?? []),
    ...(unit.exitCriteria ?? []),
  ].join(' ');
  if (/\bcustomerPass\b|PULSE_CUSTOMER_EVIDENCE[.]json/.test(hints)) flags.add('--customer');
  if (/\boperatorPass\b|PULSE_OPERATOR_EVIDENCE[.]json/.test(hints)) flags.add('--operator');
  if (/\badminPass\b|PULSE_ADMIN_EVIDENCE[.]json/.test(hints)) flags.add('--admin');
  if (/\bsoakPass\b|PULSE_SOAK_EVIDENCE[.]json/.test(hints)) flags.add('--soak');
  return [...flags];
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
