import * as path from 'node:path';
import {
  buildPulseCommandGraph,
  type PulseCommandGraph,
  type PulseCommandPurpose,
} from './command-graph';
import { safeJoin } from './lib/safe-path';
import { ensureDir, writeTextFile } from './safe-fs';

export const PULSE_COMMAND_GRAPH_ARTIFACT = 'PULSE_COMMAND_GRAPH.json';

const PROOF_COMMAND_PURPOSES = new Set<PulseCommandPurpose>([
  'install',
  'build',
  'test',
  'pulse',
  'typecheck',
  'lint',
]);

const ENV_ASSIGNMENT_PATTERN = /\b([A-Z][A-Z0-9_]{2,})=(?:"[^"]*"|'[^']*'|[^\s&|;]+)/g;
const SHELL_DEFAULT_PATTERN = /[$][{]([A-Z][A-Z0-9_]{2,})(?::[-?])[^}]*[}]/g;

export interface PulseCommandGraphArtifact extends PulseCommandGraph {
  artifactName: typeof PULSE_COMMAND_GRAPH_ARTIFACT;
  artifactPath: '.pulse/current/PULSE_COMMAND_GRAPH.json';
  redaction: {
    envValues: 'redacted';
    environmentVariables: 'names-only';
  };
  proofExecutionCommands: Array<{
    id: string;
    purpose: PulseCommandPurpose;
    command: string;
    sourcePath: string;
    scriptName?: string;
  }>;
  summary: {
    commandCount: number;
    proofExecutionCommandCount: number;
    environmentVariableCount: number;
    scannedSourceCount: number;
  };
}

function redactCommand(command: string): string {
  return command
    .replace(ENV_ASSIGNMENT_PATTERN, (_match, name: string) => `${name}=<redacted>`)
    .replace(SHELL_DEFAULT_PATTERN, (_match, name: string) => `\${${name}:<redacted>}`);
}

export function buildPulseCommandGraphArtifact(rootDir = process.cwd()): PulseCommandGraphArtifact {
  const graph = buildPulseCommandGraph(rootDir);
  const commands = graph.commands.map((command) => ({
    ...command,
    command: redactCommand(command.command),
  }));
  const proofExecutionCommands = commands
    .filter((command) => PROOF_COMMAND_PURPOSES.has(command.purpose))
    .map((command) => ({
      id: command.id,
      purpose: command.purpose,
      command: command.command,
      sourcePath: command.sourcePath,
      ...(command.scriptName ? { scriptName: command.scriptName } : {}),
    }));

  return {
    ...graph,
    artifactName: PULSE_COMMAND_GRAPH_ARTIFACT,
    artifactPath: '.pulse/current/PULSE_COMMAND_GRAPH.json',
    redaction: {
      envValues: 'redacted',
      environmentVariables: 'names-only',
    },
    commands,
    proofExecutionCommands,
    summary: {
      commandCount: commands.length,
      proofExecutionCommandCount: proofExecutionCommands.length,
      environmentVariableCount: graph.environmentVariables.length,
      scannedSourceCount: graph.scannedSources.length,
    },
  };
}

export function writePulseCommandGraphArtifact(rootDir = process.cwd()): PulseCommandGraphArtifact {
  const absoluteRoot = path.resolve(rootDir);
  const artifact = buildPulseCommandGraphArtifact(absoluteRoot);
  const pulseDir = safeJoin(absoluteRoot, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(
    safeJoin(pulseDir, PULSE_COMMAND_GRAPH_ARTIFACT),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  return artifact;
}
