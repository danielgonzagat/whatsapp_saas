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

function isEnvNameStart(char: string | undefined): boolean {
  return Boolean(char && char >= 'A' && char <= 'Z');
}

function isEnvNameChar(char: string | undefined): boolean {
  return Boolean(
    char === '_' || (char && char >= 'A' && char <= 'Z') || (char && char >= '0' && char <= '9'),
  );
}

function isAssignmentBoundary(char: string | undefined): boolean {
  return char === undefined || /\s|[;&|]/.test(char);
}

function readEnvName(command: string, start: number): { name: string; end: number } | null {
  if (!isEnvNameStart(command[start])) {
    return null;
  }

  let index = start + 1;
  while (isEnvNameChar(command[index])) {
    index++;
  }

  const name = command.slice(start, index);
  if (name.length < 3 || command[index] !== '=') {
    return null;
  }
  return { name, end: index };
}

function readShellParameterName(
  command: string,
  start: number,
): { name: string; end: number } | null {
  if (!isEnvNameStart(command[start])) {
    return null;
  }

  let index = start + 1;
  while (isEnvNameChar(command[index])) {
    index++;
  }

  const name = command.slice(start, index);
  return name.length >= 3 ? { name, end: index } : null;
}

function skipEnvValue(command: string, start: number): number {
  const quote = command[start];
  if (quote === '"' || quote === "'") {
    let index = start + 1;
    while (index < command.length) {
      if (command[index] === quote && command[index - 1] !== '\\') {
        return index + 1;
      }
      index++;
    }
    return command.length;
  }

  let index = start;
  while (index < command.length && !/\s|[;&|]/.test(command[index])) {
    index++;
  }
  return index;
}

function redactEnvAssignments(command: string): string {
  let output = '';
  let index = 0;
  while (index < command.length) {
    if (isAssignmentBoundary(command[index - 1])) {
      const envName = readEnvName(command, index);
      if (envName) {
        output += `${envName.name}=<redacted>`;
        index = skipEnvValue(command, envName.end + 1);
        continue;
      }
    }

    output += command[index];
    index++;
  }
  return output;
}

function redactShellDefaultExpansions(command: string): string {
  let output = '';
  let index = 0;
  while (index < command.length) {
    if (command[index] !== '$' || command[index + 1] !== '{') {
      output += command[index];
      index++;
      continue;
    }

    const envName = readShellParameterName(command, index + 2);
    const operatorIndex = envName ? envName.end : -1;
    const hasDefaultOperator =
      envName !== null &&
      command[operatorIndex] === ':' &&
      (command[operatorIndex + 1] === '-' || command[operatorIndex + 1] === '?');
    if (!hasDefaultOperator) {
      output += command[index];
      index++;
      continue;
    }

    let end = operatorIndex + 2;
    while (end < command.length && command[end] !== '}') {
      end++;
    }
    if (command[end] !== '}') {
      output += command[index];
      index++;
      continue;
    }

    output += `\${${envName.name}:<redacted>}`;
    index = end + 1;
  }
  return output;
}

function redactCommand(command: string): string {
  return redactShellDefaultExpansions(redactEnvAssignments(command));
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
