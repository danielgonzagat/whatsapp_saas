import { getTargetLabel } from './profiles';
import type { PulseConfig } from './types';
import type { deriveEffectiveTarget } from './index-cli';

interface PrintPulseStartupSummaryInput {
  humanReadableOutput: boolean;
  config: PulseConfig;
  mode: string;
  modeHasRuntimeParsers: boolean;
  target: ReturnType<typeof deriveEffectiveTarget>;
  showTarget: boolean;
  actorModes: string[];
  loadedEnvFiles: string[];
}

export function printPulseStartupSummary(input: PrintPulseStartupSummaryInput): void {
  const {
    humanReadableOutput,
    config,
    mode,
    modeHasRuntimeParsers,
    target,
    showTarget,
    actorModes,
    loadedEnvFiles,
  } = input;

  if (humanReadableOutput) {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║    PULSE — Live Codebase Nervous System         ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
  }

  if (humanReadableOutput) {
    console.log(`  Frontend:  ${config.frontendDir}`);
    console.log(`  Backend:   ${config.backendDir}`);
    console.log(`  Schema:    ${config.schemaPath || '(not found)'}`);
    console.log(`  Prefix:    ${config.globalPrefix || '(none)'}`);
  }
  if (humanReadableOutput) {
    console.log(`  Mode:      ${mode}${modeHasRuntimeParsers ? ' (runtime parsers active)' : ''}`);
  }
  if (humanReadableOutput && showTarget) {
    console.log(`  Target:    ${getTargetLabel(target)}`);
  }
  if (humanReadableOutput && actorModes.length > 0) {
    console.log(`  Actors:    ${actorModes.join(', ')}`);
  }
  if (humanReadableOutput && loadedEnvFiles.length > 0) {
    console.log(`  Local env: ${loadedEnvFiles.join(', ')} loaded`);
  }
  if (humanReadableOutput) {
    console.log('');
    console.log('  Scanning...');
  }
}
