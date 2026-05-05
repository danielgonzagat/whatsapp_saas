import * as fs from 'fs';
import * as path from 'path';

import type {
  RealSandboxExecutionCommandResult,
  RealSandboxExecutionResult,
  RealSandboxLifecycleEvidence,
} from './types';
import type { ExecuteRealSandboxInput } from './types';
import {
  evidenceStatusBlocked,
  evidenceStatusFailed,
  evidenceStatusNotRequired,
  evidenceStatusPassed,
  planStatusBlocked,
  planStatusReady,
} from './kernel';
import type { RealSandboxWorkspacePlan } from './types';
import { ensureDir, pathExists } from '../../safe-fs';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';

function copyFileIntoWorkspace(rootDir: string, workspacePath: string, relativePath: string): void {
  const sourcePath = path.join(rootDir, relativePath);
  const targetPath = path.join(workspacePath, relativePath);
  ensureDir(path.dirname(targetPath), { recursive: true });

  if (!pathExists(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
}

function materializeWorkspace(plan: RealSandboxWorkspacePlan): void {
  ensureDir(plan.workspacePath, { recursive: true });
  for (const relativePath of plan.touchedPaths) {
    copyFileIntoWorkspace(plan.rootDir, plan.workspacePath, relativePath);
  }
}

export async function executeRealSandbox(
  input: ExecuteRealSandboxInput,
): Promise<RealSandboxExecutionResult> {
  const { plan, runner } = input;

  if (plan.status === planStatusBlocked()) {
    return {
      executed: false,
      isolatedWorktree: true,
      workspacePath: plan.workspacePath,
      exitCode: null,
      summary: `Sandbox execution blocked by policy: ${plan.blockedReasons
        .map((entry) => entry.code)
        .join(', ')}`,
      planStatus: plan.status,
      evidenceStatus: evidenceStatusBlocked(),
      lifecycle: plan.lifecycle,
      patch: plan.patch,
      commands: plan.commands.map((command) => ({
        ...command,
        exitCode: null,
        skipped: true,
      })),
      blockedReasons: plan.blockedReasons,
    };
  }

  const lifecycle: RealSandboxLifecycleEvidence = {
    ...plan.lifecycle,
    workspaceCreated: evidenceStatusPassed(),
  };
  materializeWorkspace(plan);
  lifecycle.workspaceMaterialized = evidenceStatusPassed();

  const commandResults: RealSandboxExecutionCommandResult[] = [];
  if (plan.patch.status === planStatusReady()) {
    const patchCommands = [
      { command: plan.patch.checkCommand, kind: 'patch_check' as const },
      { command: plan.patch.applyCommand, kind: 'patch_apply' as const },
    ];

    for (const patchCommand of patchCommands) {
      if (!patchCommand.command) continue;
      const result = await runner(patchCommand.command, {
        cwd: plan.workspacePath,
        commandKind: patchCommand.kind,
      });
      commandResults.push({
        command: patchCommand.command,
        kind: patchCommand.kind,
        exitCode: result.exitCode,
        skipped: false,
      });
      if (patchCommand.kind === 'patch_check') {
        lifecycle.patchChecked =
          result.exitCode === deriveZeroValue() ? evidenceStatusPassed() : evidenceStatusFailed();
      }
      if (patchCommand.kind === 'patch_apply') {
        lifecycle.patchApplied =
          result.exitCode === deriveZeroValue() ? evidenceStatusPassed() : evidenceStatusFailed();
      }
      if (result.exitCode !== deriveZeroValue()) {
        return {
          executed: true,
          isolatedWorktree: true,
          workspacePath: plan.workspacePath,
          exitCode: result.exitCode,
          summary: `Sandbox patch lifecycle failed: ${patchCommand.command}`,
          planStatus: plan.status,
          evidenceStatus: evidenceStatusFailed(),
          lifecycle,
          patch: plan.patch,
          commands: commandResults,
          blockedReasons: [],
        };
      }
    }
  }

  for (const command of plan.commands) {
    const result = await runner(command.command, {
      cwd: plan.workspacePath,
      commandKind: command.kind,
    });
    commandResults.push({
      command: command.command,
      kind: command.kind,
      exitCode: result.exitCode,
      skipped: false,
    });
    if (result.exitCode !== deriveZeroValue()) {
      return {
        executed: true,
        isolatedWorktree: true,
        workspacePath: plan.workspacePath,
        exitCode: result.exitCode,
        summary: `Sandbox command failed: ${command.command}`,
        planStatus: plan.status,
        evidenceStatus: evidenceStatusFailed(),
        lifecycle: {
          ...lifecycle,
          validationPassed: evidenceStatusFailed(),
        },
        patch: plan.patch,
        commands: commandResults,
        blockedReasons: [],
      };
    }
  }
  lifecycle.validationPassed =
    plan.commands.length === deriveZeroValue()
      ? evidenceStatusNotRequired()
      : evidenceStatusPassed();

  return {
    executed: true,
    isolatedWorktree: true,
    workspacePath: plan.workspacePath,
    exitCode: deriveZeroValue(),
    summary: `Sandbox executed ${commandResults.length} command(s) in isolated workspace path.`,
    planStatus: plan.status,
    evidenceStatus: evidenceStatusPassed(),
    lifecycle,
    patch: plan.patch,
    commands: commandResults,
    blockedReasons: [],
  };
}
