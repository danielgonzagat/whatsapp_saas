function buildPatchPlan(
  rootDir: string,
  patchPath: string | null | undefined,
  boundary: RealSandboxProtectedBoundary,
): RealSandboxPatchPlan {
  if (!patchPath) {
    return {
      patchPath: null,
      status: 'not_provided',
      changedFiles: [],
      checkCommand: null,
      applyCommand: null,
      blockedReasons: [],
    };
  }

  const resolved = resolveInsideRoot(rootDir, patchPath);
  const blockedReasons: RealSandboxBlockedReason[] = [];
  if (!resolved.inside) {
    blockedReasons.push({
      code: 'patch_path',
      target: patchPath,
      reason: 'Patch file must live inside the repository root.',
    });
  }

  const absolutePatchPath = path.resolve(resolveRoot(rootDir), patchPath);
  let patchContent = '';
  if (blockedReasons.length === 0) {
    try {
      patchContent = fs.readFileSync(absolutePatchPath, 'utf8');
    } catch {
      blockedReasons.push({
        code: 'patch_read_failed',
        target: resolved.relPath,
        reason: 'Patch file could not be read for sandbox planning.',
      });
    }
  }

  const changedFiles = patchContent ? extractChangedFilesFromPatch(patchContent) : [];
  for (const changedFile of changedFiles) {
    blockedReasons.push(...classifyPath(rootDir, changedFile, boundary).blockedReasons);
  }

  const normalizedPatchPath = resolved.inside
    ? path.join(resolveRoot(rootDir), resolved.relPath)
    : null;
  return {
    patchPath: normalizedPatchPath,
    status: blockedReasons.length > 0 ? 'blocked' : 'ready',
    changedFiles,
    checkCommand: normalizedPatchPath
      ? `git apply --check ${quoteCommandArg(normalizedPatchPath)}`
      : null,
    applyCommand: normalizedPatchPath ? `git apply ${quoteCommandArg(normalizedPatchPath)}` : null,
    blockedReasons,
  };
}

function classifyCommand(command: string): {
  command: string;
  plan: RealSandboxCommandPlan | null;
  blockedReason: RealSandboxBlockedReason | null;
} {
  const normalized = normalizeCommand(command);
  if (DESTRUCTIVE_COMMAND_RE.test(normalized)) {
    return {
      command: normalized,
      plan: null,
      blockedReason: {
        code: 'destructive_command',
        target: normalized,
        reason:
          'Command is destructive or can mutate git, database, migrations, or filesystem state.',
      },
    };
  }

  if (!APPROVED_COMMAND_RE.test(normalized)) {
    return {
      command: normalized,
      plan: null,
      blockedReason: {
        code: 'unapproved_command',
        target: normalized,
        reason: 'Only read-only git inspection and validation/PULSE commands are allowed.',
      },
    };
  }

  return {
    command: normalized,
    plan: {
      command: normalized,
      kind: VALIDATION_COMMAND_RE.test(normalized) ? 'validation' : 'read_only',
    },
    blockedReason: null,
  };
}

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

  if (plan.status === 'blocked') {
    return {
      executed: false,
      isolatedWorktree: true,
      workspacePath: plan.workspacePath,
      exitCode: null,
      summary: `Sandbox execution blocked by policy: ${plan.blockedReasons
        .map((entry) => entry.code)
        .join(', ')}`,
      planStatus: plan.status,
      evidenceStatus: 'blocked',
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
    workspaceCreated: 'passed',
  };
  materializeWorkspace(plan);
  lifecycle.workspaceMaterialized = 'passed';

  const commandResults: RealSandboxExecutionCommandResult[] = [];
  if (plan.patch.status === 'ready') {
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
        lifecycle.patchChecked = result.exitCode === 0 ? 'passed' : 'failed';
      }
      if (patchCommand.kind === 'patch_apply') {
        lifecycle.patchApplied = result.exitCode === 0 ? 'passed' : 'failed';
      }
      if (result.exitCode !== 0) {
        return {
          executed: true,
          isolatedWorktree: true,
          workspacePath: plan.workspacePath,
          exitCode: result.exitCode,
          summary: `Sandbox patch lifecycle failed: ${patchCommand.command}`,
          planStatus: plan.status,
          evidenceStatus: 'failed',
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
    if (result.exitCode !== 0) {
      return {
        executed: true,
        isolatedWorktree: true,
        workspacePath: plan.workspacePath,
        exitCode: result.exitCode,
        summary: `Sandbox command failed: ${command.command}`,
        planStatus: plan.status,
        evidenceStatus: 'failed',
        lifecycle: {
          ...lifecycle,
          validationPassed: 'failed',
        },
        patch: plan.patch,
        commands: commandResults,
        blockedReasons: [],
      };
    }
  }
  lifecycle.validationPassed = plan.commands.length === 0 ? 'not_required' : 'passed';

  return {
    executed: true,
    isolatedWorktree: true,
    workspacePath: plan.workspacePath,
    exitCode: 0,
    summary: `Sandbox executed ${commandResults.length} command(s) in isolated workspace path.`,
    planStatus: plan.status,
    evidenceStatus: 'passed',
    lifecycle,
    patch: plan.patch,
    commands: commandResults,
    blockedReasons: [],
  };
}

