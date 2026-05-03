import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../../autonomy-loop.types';
import { DEFAULT_VALIDATION_COMMANDS } from '../../autonomy-loop.types';
import { buildRequiredValidationCommands } from '../../autonomy-loop.required-validations';
import { unique } from '../../autonomy-loop.utils';
import {
  flagsFromScenarioMetadata,
  flagsFromGateMetadata,
  type SyntheticActorFlag,
} from './scenario-metadata';

export function normalizeValidationCommands(
  commands: string[],
  directive: PulseAutonomousDirective,
): string[] {
  if (commands.length > 0) return unique(commands.filter(Boolean));
  const suggested = directive.suggestedValidation?.commands || [];
  if (suggested.length > 0) return unique(suggested.filter(Boolean));
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
  const actorFlags = new Set<SyntheticActorFlag>([
    ...flagsFromScenarioMetadata(scenarioIds),
    ...flagsFromGateMetadata(gateNames, allTargets),
  ]);
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
  if (needsScenarioValidation && actorFlags.size > 0)
    commands.push(`node scripts/pulse/run.js ${Array.from(actorFlags).join(' ')} --fast --json`);
  else if (needsScenarioValidation) commands.push('node scripts/pulse/run.js --deep --fast --json');
  else if (needsRuntimeValidation || needsBrowserValidation)
    commands.push('node scripts/pulse/run.js --deep --fast --json');
  commands.push('node scripts/pulse/run.js --guidance');
  return unique(commands);
}

export function buildUnitValidationCommands(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  fallbackCommands: string[],
): string[] {
  const required = buildRequiredValidationCommands(unit);
  if (required.length > 0) return unique(required.filter(Boolean));
  return buildBatchValidationCommands(directive, [unit], fallbackCommands);
}
