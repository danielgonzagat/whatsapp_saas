import * as path from 'path';
import type {
  RealSandboxProtectedBoundary,
  RealSandboxWorkspacePlan,
  BuildRealSandboxPlanInput,
} from './types';
import { resolveRoot, unique, loadProtectedBoundary, stableWorkspaceId } from './path';
import { classifyPath } from './path';
import { buildPatchPlan } from './patch';
import { classifyCommand } from './command';

export function buildRealSandboxPlan(input: BuildRealSandboxPlanInput): RealSandboxWorkspacePlan {
  const rootDir = resolveRoot(input.rootDir);
  const protectedBoundary = input.protectedBoundary ?? loadProtectedBoundary(rootDir);
  const patch = buildPatchPlan(rootDir, input.patchPath, protectedBoundary);
  const pathResults = unique(input.touchedPaths ?? []).map((candidate) =>
    classifyPath(rootDir, candidate, protectedBoundary),
  );
  const commandResults = unique(input.commands ?? []).map(classifyCommand);
  const touchedPaths = pathResults.map((result) => result.relPath);
  const commands = commandResults.flatMap((result) => (result.plan ? [result.plan] : []));
  const blockedReasons = [
    ...pathResults.flatMap((result) => result.blockedReasons),
    ...patch.blockedReasons,
    ...commandResults.flatMap((result) => (result.blockedReason ? [result.blockedReason] : [])),
  ];
  const workspaceId =
    input.workspaceId ??
    stableWorkspaceId(
      rootDir,
      touchedPaths,
      commands.map((entry) => entry.command),
    );
  const workspaceBaseDir = input.workspaceBaseDir ?? path.join(rootDir, '.pulse', 'real-sandboxes');
  const workspacePath = path.join(resolveRoot(workspaceBaseDir), workspaceId);

  return {
    workspaceId,
    rootDir,
    workspacePath,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: blockedReasons.length > 0 ? 'blocked' : 'ready',
    touchedPaths: unique([...touchedPaths, ...patch.changedFiles]).sort(),
    commands,
    patch,
    lifecycle: {
      workspaceCreated: blockedReasons.length > 0 ? 'blocked' : 'planned',
      workspaceMaterialized: blockedReasons.length > 0 ? 'blocked' : 'planned',
      patchChecked:
        patch.status === 'not_provided'
          ? 'not_required'
          : blockedReasons.length > 0
            ? 'blocked'
            : 'planned',
      patchApplied:
        patch.status === 'not_provided'
          ? 'not_required'
          : blockedReasons.length > 0
            ? 'blocked'
            : 'planned',
      validationPassed:
        commands.length === 0 ? 'not_required' : blockedReasons.length > 0 ? 'blocked' : 'planned',
    },
    blockedReasons,
    isolatedWorkspacePathPlan: {
      strategy: 'directory_workspace',
      sourceRoot: rootDir,
      workspacePath,
    },
  };
}
