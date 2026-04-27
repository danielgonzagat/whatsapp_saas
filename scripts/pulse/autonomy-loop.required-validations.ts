import type { PulseAutonomousDirectiveUnit } from './autonomy-loop.types';

type RequiredValidationCategory =
  | 'typecheck'
  | 'affected-tests'
  | 'flow-evidence'
  | 'scenario-evidence'
  | 'browser-evidence';

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
        commands.push('npx jest --findRelatedTests --passWithNoTests');
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
        const scenarios = unit.scenarioIds ?? [];
        if (scenarios.length === 0) {
          commands.push('npm --prefix e2e exec playwright test --pass-with-no-tests');
        } else {
          for (const sid of scenarios) {
            commands.push(
              `npm --prefix e2e exec playwright test specs/${sid}.spec.ts --pass-with-no-tests`,
            );
          }
        }
        break;
      }
      case 'browser-evidence':
        commands.push('node scripts/pulse/run.js --deep --customer --operator --admin --fast');
        break;
    }
  }
  return commands;
}
