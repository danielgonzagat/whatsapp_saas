/**
 * Codex execution and validation helpers for the autonomy loop.
 */
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildArtifactRegistry } from './artifact-registry';
import { createAppendStream, ensureDir, pathExists, readTextFile } from './safe-fs';
import type {
  PulseAutonomyValidationCommandResult,
  PulseAgentOrchestrationWorkerResult,
} from './types';
import type { PulseAutonomousDirective, PulseAutonomousDirectiveUnit } from './autonomy-loop.types';
import { compact } from './autonomy-loop.utils';
import { toUnitSnapshot } from './autonomy-loop.unit-ranking';
import { buildWorkerPrompt } from './autonomy-loop.prompt';
import {
  prepareIsolatedWorkerWorkspace,
  collectWorkspacePatch,
  applyWorkerPatchToRoot,
} from './autonomy-loop.workspace';

export function buildCodexCommand(args: string[]): string {
  return ['codex', ...args.map((arg) => JSON.stringify(arg))].join(' ');
}

export function runCodexExec(
  rootDir: string,
  prompt: string,
  codexModel: string | null,
): { command: string; exitCode: number | null; finalMessage: string | null } {
  const registry = buildArtifactRegistry(rootDir);
  ensureDir(registry.tempDir, { recursive: true });
  const outputPath = path.join(registry.tempDir, `pulse-autonomy-codex-${Date.now()}.txt`);
  const args = ['exec', '--full-auto', '-C', rootDir, '--output-last-message', outputPath];

  if (codexModel) {
    args.push('-m', codexModel);
  }

  args.push('-');

  const result = spawnSync('codex', args, {
    cwd: rootDir,
    input: prompt,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  const finalMessage = pathExists(outputPath) ? readTextFile(outputPath).trim() : null;

  return {
    command: buildCodexCommand(args),
    exitCode: result.status,
    finalMessage: finalMessage || null,
  };
}

export function runCodexExecAsync(
  workingDir: string,
  prompt: string,
  codexModel: string | null,
  workerId: string,
): Promise<{
  command: string;
  exitCode: number | null;
  finalMessage: string | null;
  logPath: string;
}> {
  return new Promise((resolve, reject) => {
    const registry = buildArtifactRegistry(workingDir);
    ensureDir(registry.tempDir, { recursive: true });
    const timestamp = `${Date.now()}-${workerId}`;
    const outputPath = path.join(registry.tempDir, `pulse-autonomy-${timestamp}.txt`);
    const logPath = path.join(registry.tempDir, `pulse-autonomy-${timestamp}.log`);
    const args = ['exec', '--full-auto', '-C', workingDir, '--output-last-message', outputPath];

    if (codexModel) {
      args.push('-m', codexModel);
    }

    args.push('-');

    const child = spawn('codex', args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const logStream = createAppendStream(logPath);
    child.stdout.on('data', (chunk) => {
      logStream.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      logStream.write(chunk);
    });
    child.on('error', (error) => {
      logStream.end();
      reject(error);
    });
    child.on('close', (code) => {
      logStream.end();
      const finalMessage = pathExists(outputPath) ? readTextFile(outputPath).trim() : null;
      resolve({
        command: buildCodexCommand(args),
        exitCode: code,
        finalMessage: finalMessage || null,
        logPath,
      });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export function runValidationCommands(
  rootDir: string,
  commands: string[],
): PulseAutonomyValidationCommandResult[] {
  return commands.map((command) => {
    const startedAt = Date.now();
    const result = spawnSync('zsh', ['-lc', command], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    const durationMs = Date.now() - startedAt;
    return {
      command,
      exitCode: result.status,
      durationMs,
      summary:
        result.status === 0
          ? `Command succeeded in ${durationMs}ms.`
          : `Command failed with exit code ${result.status ?? 'unknown'} after ${durationMs}ms.`,
    };
  });
}

export async function runParallelWorkerAssignment(
  rootDir: string,
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  workerOrdinal: number,
  totalWorkers: number,
  codexModel: string | null,
  maxWorkerRetries: number,
): Promise<PulseAgentOrchestrationWorkerResult> {
  const workerId = `worker-${workerOrdinal}`;
  const startedAt = new Date().toISOString();
  let workspace: import('./autonomy-loop.types').PulseWorkerWorkspace | null = null;
  let attemptCount = 0;
  let logPath: string | null = null;
  let finalCommand: string | null = null;
  let finalExitCode: number | null = null;
  let finalMessage: string | null = null;
  let patchPath: string | null = null;
  let changedFiles: string[] = [];
  let applyStatus: PulseAgentOrchestrationWorkerResult['applyStatus'] = 'not_applicable';
  let applySummary: string | null = null;

  try {
    workspace = prepareIsolatedWorkerWorkspace(rootDir, workerId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown workspace preparation failure.';
    return {
      workerId,
      attemptCount: 0,
      status: 'failed',
      summary: `Worker ${workerId} failed before execution: ${compact(message, 300)}`,
      unit: toUnitSnapshot(unit),
      startedAt,
      finishedAt: new Date().toISOString(),
      lockedCapabilities: unit.affectedCapabilities || [],
      lockedFlows: unit.affectedFlows || [],
      workspaceMode: 'isolated_copy',
      workspacePath: null,
      patchPath: null,
      changedFiles: [],
      applyStatus: 'failed',
      applySummary: compact(message, 300),
      logPath: null,
      codex: {
        executed: false,
        command: null,
        exitCode: 1,
        finalMessage: null,
      },
    };
  }

  while (attemptCount < Math.max(1, maxWorkerRetries + 1)) {
    attemptCount += 1;
    const result = await runCodexExecAsync(
      workspace.workspacePath,
      buildWorkerPrompt(directive, unit, workerOrdinal, totalWorkers),
      codexModel,
      `${workerId}-attempt-${attemptCount}`,
    );
    logPath = result.logPath;
    finalCommand = result.command;
    finalExitCode = result.exitCode;
    finalMessage = result.finalMessage;
    if (result.exitCode === 0) {
      break;
    }
  }

  if (finalExitCode === 0) {
    try {
      const patch = collectWorkspacePatch(workspace.workspacePath, workspace.patchPath);
      patchPath = patch.patchPath;
      changedFiles = patch.changedFiles;
      applyStatus = patch.patchPath ? 'planned' : 'skipped';
      applySummary = patch.summary;
    } catch (error) {
      finalExitCode = 1;
      applyStatus = 'failed';
      applySummary =
        error instanceof Error ? compact(error.message, 300) : 'Unknown patch collection failure.';
    }
  }

  const status = finalExitCode === 0 ? 'completed' : 'failed';
  const finishedAt = new Date().toISOString();
  return {
    workerId,
    attemptCount,
    status,
    summary:
      status === 'completed'
        ? `Worker ${workerId} completed ${unit.title} in ${attemptCount} attempt(s).`
        : `Worker ${workerId} failed ${unit.title} after ${attemptCount} attempt(s).`,
    unit: toUnitSnapshot(unit),
    startedAt,
    finishedAt,
    lockedCapabilities: unit.affectedCapabilities || [],
    lockedFlows: unit.affectedFlows || [],
    workspaceMode: workspace.workspaceMode,
    workspacePath: workspace.workspacePath,
    patchPath,
    changedFiles,
    applyStatus,
    applySummary,
    logPath,
    codex: {
      executed: true,
      command: finalCommand,
      exitCode: finalExitCode,
      finalMessage,
    },
  };
}
