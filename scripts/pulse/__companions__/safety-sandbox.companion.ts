// ────────────────────────────────────────────────────────────────────────────
// Protected Files
// ────────────────────────────────────────────────────────────────────────────

export function loadProtectedFiles(rootDir: string): string[] {
  const configPath = path.join(rootDir, PROTECTED_FILES_PATH);

  if (!pathExists(configPath)) {
    return [];
  }

  try {
    const config = readJsonFile<ProtectedGovernanceConfig>(configPath);
    const files: string[] = [];

    if (config.protectedExact) {
      for (const file of config.protectedExact) {
        files.push(file);
      }
    }

    if (config.protectedPrefixes) {
      for (const prefix of config.protectedPrefixes) {
        const fullPrefix = path.join(rootDir, prefix);
        if (pathExists(fullPrefix)) {
          expandDirectory(fullPrefix, rootDir, files);
        }
      }
    }

    return files;
  } catch {
    return [];
  }
}

function expandDirectory(dirPath: string, rootDir: string, accumulator: string[]): void {
  if (!pathExists(dirPath)) {
    return;
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      expandDirectory(full, rootDir, accumulator);
    } else if (entry.isFile()) {
      accumulator.push(path.relative(rootDir, full));
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Destructive Action Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyDestructiveActions(rootDir: string): DestructiveAction[] {
  const protectedFiles = loadProtectedFiles(rootDir);
  const actions: DestructiveAction[] = [];
  const seen = new Set<string>();

  function walk(dir: string): void {
    if (!pathExists(dir)) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        entry.name.startsWith('.') &&
        entry.name !== '.github' &&
        !entry.name.startsWith('.env') &&
        entry.name !== '.codacy.yml'
      ) {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }

      const full = path.join(dir, entry.name);
      const relative = path.relative(rootDir, full);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        let content = '';
        try {
          content = fs.readFileSync(full, 'utf8');
        } catch {
          content = '';
        }

        const normalizedRelative = normalizeRepoPath(relative);
        const isProtected = protectedFiles.some((protectedFile) => {
          const normalizedProtected = normalizeRepoPath(protectedFile);
          return (
            normalizedProtected === normalizedRelative ||
            normalizedRelative.startsWith(`${normalizedProtected}/`)
          );
        });
        const effectGraph = buildFileEffectGraph({
          relativePath: normalizedRelative,
          content,
          protectedByGovernance: isProtected,
        });

        for (const { kind, description } of deriveActionKindsFromEffectGraph(effectGraph)) {
          if (seen.has(`${kind}:${normalizedRelative}`)) continue;
          seen.add(`${kind}:${normalizedRelative}`);
          const reqs = deriveRequirementsFromEffectGraph(kind, effectGraph);
          const riskLevel = deriveRiskLevelFromEffectGraph(kind, effectGraph);

          actions.push({
            actionId: `${kind}:${normalizedRelative}`,
            kind,
            description: `${description}: ${normalizedRelative}`,
            targetFile: normalizedRelative,
            riskLevel,
            requiresHumanApproval: false,
            requiresGovernedSandbox: reqs.requiresGovernedSandbox,
            requiresDryRun: reqs.requiresDryRun,
            requiresBackup: reqs.requiresBackup,
            requiresRollbackProof: reqs.requiresRollbackProof,
            sandboxOnly: reqs.sandboxOnly,
          });
        }
      }
    }
  }

  walk(rootDir);
  return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Risk Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyRiskLevel(kind: DestructiveActionKind): SandboxRiskLevel {
  return deriveRiskLevelFromEffectGraph(kind, null);
}

export function isActionAllowedInAutonomy(action: DestructiveAction): boolean {
  if (action.requiresGovernedSandbox) {
    return false;
  }
  if (action.sandboxOnly) {
    return false;
  }
  if (
    action.kind === 'governance_change' ||
    action.kind === 'protected_file_edit' ||
    action.kind === 'secret_access'
  ) {
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Gate Requirements Per Operation Type
// ────────────────────────────────────────────────────────────────────────────

/**
 * Gate level derived from the operation kind's risk profile and requirements.
 *
 * Used by the autonomy loop to decide whether a proposed change can proceed
 * through PULSE-governed validation.
 */
export type GateDecision =
  | 'alllow_autonomous' // No gate required; safe for autonomous execution
  | 'require_sandbox' // Must execute inside a validated sandbox
  | 'block_permanently'; // Operation should never be attempted

function buildGovernedSandboxChecks(action: DestructiveAction): string[] {
  const checks = ['sandbox-created', 'pre-validation', 'patch-validated'];

  if (action.requiresDryRun) {
    checks.push('dry-run');
  }
  if (action.requiresBackup) {
    checks.push('backup-created');
  }
  if (action.requiresRollbackProof) {
    checks.push('rollback-validated');
  }

  checks.push('post-validation');
  return checks;
}

function isAutonomousPolicyBoundary(action: DestructiveAction): boolean {
  return action.requiresGovernedSandbox && !action.requiresDryRun && !action.sandboxOnly;
}

/**
 * Classify the gate requirement for a specific destructive action.
 *
 * This is the central decision function that the autonomy loop calls
 * before applying any change to the repository.
 */
export function classifyGateRequirement(action: DestructiveAction): {
  decision: GateDecision;
  reason: string;
  requiredChecks: string[];
} {
  const kind = action.kind;

  if (isAutonomousPolicyBoundary(action)) {
    return {
      decision: 'block_permanently',
      reason: `${kind} is outside autonomous execution policy. PULSE records the boundary and blocks execution with policy evidence.`,
      requiredChecks: ['policy-boundary-recorded'],
    };
  }

  if (action.requiresGovernedSandbox || action.sandboxOnly) {
    return {
      decision: 'require_sandbox',
      reason: `${kind} requires governed sandbox validation from its patch effects, blast radius, and proof needs.`,
      requiredChecks: buildGovernedSandboxChecks(action),
    };
  }

  return {
    decision: 'alllow_autonomous',
    reason: `${kind} has no sandbox-only, dry-run, backup, rollback, or boundary proof requirement.`,
    requiredChecks: [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Patch Validation
// ────────────────────────────────────────────────────────────────────────────

export function validatePatchForProtectedFiles(
  patchFile: string,
  protectedFiles: string[],
): boolean {
  if (!protectedFiles.length) {
    return true;
  }

  if (!pathExists(patchFile)) {
    return false;
  }

  let content: string;
  try {
    content = fs.readFileSync(patchFile, 'utf8');
  } catch {
    return false;
  }

  const modifiedFiles = extractModifiedFilesFromPatch(content);

  for (const file of modifiedFiles) {
    for (const pf of protectedFiles) {
      if (file === pf) {
        return false;
      }
      if (pf.endsWith('/') && file.startsWith(pf)) {
        return false;
      }
      if (file.startsWith(pf + '/')) {
        return false;
      }
    }
  }

  return true;
}

function extractModifiedFilesFromPatch(patch: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const line of patch.split('\n')) {
    if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
      const filePath = line.replace(/^[-+]{3} [ab]\//, '').trim();
      if (filePath && filePath !== '/dev/null' && !seen.has(filePath)) {
        seen.add(filePath);
        files.push(filePath);
      }
    }
  }

  return files;
}

// ────────────────────────────────────────────────────────────────────────────
// Logical Sandbox Workspace (Planning Concept)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a logical sandbox workspace for planning validation.
 *
 * This is NOT an actual git worktree clone. It is a planning concept
 * that records what a workspace would look like for a set of proposed
 * changes, so the autonomy loop can make gating decisions.
 */
export function createLogicalSandbox(params: {
  parentBranch: string;
  filesTouched: string[];
  actionKinds: DestructiveActionKind[];
  rootDir: string;
}): SandboxWorkspace {
  const now = new Date();
  const maxRisk = params.actionKinds.reduce<SandboxRiskLevel>((max, kind) => {
    const risk = deriveRiskLevelFromEffectGraph(kind, null);
    return RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(max) ? risk : max;
  }, 'safe' as SandboxRiskLevel);

  const maxMinutes = params.actionKinds.reduce((max, kind) => {
    const rules = deriveIsolationRules(kind, params.rootDir);
    return Math.max(max, rules.maxActiveMinutes);
  }, DEFAULT_LOGICAL_SANDBOX_MINUTES);

  const expiresAt = new Date(now.getTime() + maxMinutes * 60 * 1000);

  const workspaceId = `sandbox-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspacePath = path.join(params.rootDir, '.pulse', 'sandboxes', workspaceId);

  return {
    workspacePath,
    parentBranch: params.parentBranch,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    filesTouched: params.filesTouched,
    maxRiskLevel: maxRisk,
    patches: [],
    validationResults: [],
    status: 'active',
    allowedActionKinds: params.actionKinds,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Isolation Rules Access
// ────────────────────────────────────────────────────────────────────────────

function commandsByPurpose(rootDir: string, purposes: PulseCommandPurpose[]): string[] {
  try {
    const purposeSet = new Set<PulseCommandPurpose>(purposes);
    return buildPulseCommandGraph(rootDir)
      .commands.filter((command) => purposeSet.has(command.purpose))
      .sort((left, right) => {
        const byConfidence =
          ['high', 'medium', 'low'].indexOf(left.confidence) -
          ['high', 'medium', 'low'].indexOf(right.confidence);
        return byConfidence === 0 ? left.command.localeCompare(right.command) : byConfidence;
      })
      .map((command) => command.command);
  } catch {
    return [];
  }
}

function deriveBlockedPaths(rootDir: string | null, graph: FileEffectGraph): string[] {
  if (!rootDir) {
    return [];
  }

  const blocked = new Set<string>();

  if (graph.protectedByGovernance || graph.fileEffects.has('governance_surface')) {
    for (const protectedFile of loadProtectedFiles(rootDir)) {
      blocked.add(normalizeRepoPath(protectedFile));
    }
  }

  if (graph.fileEffects.has('secret_surface') || graph.patchEffects.has('secret_evidence')) {
    try {
      for (const environmentVariable of buildPulseCommandGraph(rootDir).environmentVariables) {
        if (environmentVariable.secretLike) {
          blocked.add(normalizeRepoPath(environmentVariable.sourcePath));
        }
      }
    } catch {
      return [...blocked].sort();
    }
  }

  return [...blocked].sort();
}

function deriveValidationPurposes(graph: FileEffectGraph): {
  pre: PulseCommandPurpose[];
  post: PulseCommandPurpose[];
} {
  const pre = new Set<PulseCommandPurpose>();
  const post = new Set<PulseCommandPurpose>();

  if (!graph.fileEffects.has('secret_surface')) {
    pre.add('lint');
    pre.add('typecheck');
  }
  if (!graph.protectedByGovernance && !graph.fileEffects.has('secret_surface')) {
    post.add('test');
  }
  if (graph.fileEffects.has('infra_surface')) {
    post.add('build');
  }

  return { pre: [...pre], post: [...post] };
}

function deriveMaxActiveMinutes(input: {
  riskLevel: SandboxRiskLevel;
  requirements: ActionSafetyRequirements;
  preValidationCommands: string[];
  postValidationCommands: string[];
}): number {
  const riskWeight = RISK_ORDER.indexOf(input.riskLevel) + RISK_ORDER.length;
  const proofSteps = [
    input.requirements.requiresDryRun,
    input.requirements.requiresBackup,
    input.requirements.requiresRollbackProof,
    input.requirements.sandboxOnly,
  ].filter(Boolean).length;
  const validationSteps = input.preValidationCommands.length + input.postValidationCommands.length;

  return DEFAULT_LOGICAL_SANDBOX_MINUTES * (riskWeight + proofSteps + validationSteps);
}

function deriveIsolationRules(
  kind: DestructiveActionKind,
  rootDir: string | null,
): SandboxIsolationRules {
  const graph = buildEmptyEffectGraph(kind);
  const riskLevel = deriveRiskLevelFromEffectGraph(kind, graph);
  const requirements = deriveRequirementsFromEffectGraph(kind, graph);
  const purposes = deriveValidationPurposes(graph);
  const preValidationCommands = rootDir ? commandsByPurpose(rootDir, purposes.pre) : [];
  const postValidationCommands = rootDir ? commandsByPurpose(rootDir, purposes.post) : [];

  return {
    kind,
    requiresSeparateWorktree: requirements.requiresGovernedSandbox || requirements.sandboxOnly,
    requiresNetworkIsolation:
      graph.patchEffects.has('external_mutation') || graph.fileEffects.has('secret_surface'),
    requiresDatabaseIsolation:
      graph.fileEffects.has('migration_surface') ||
      graph.patchEffects.has('persistent_delete') ||
      graph.patchEffects.has('destructive_sql') ||
      graph.patchEffects.has('external_mutation'),
    blockedPaths: deriveBlockedPaths(rootDir, graph),
    preValidationCommands,
    postValidationCommands,
    maxActiveMinutes: deriveMaxActiveMinutes({
      riskLevel,
      requirements,
      preValidationCommands,
      postValidationCommands,
    }),
  };
}

export function getIsolationRules(
  kind: DestructiveActionKind,
  rootDir: string | null = null,
): SandboxIsolationRules {
  return deriveIsolationRules(kind, rootDir);
}

export function getAllIsolationRules(rootDir: string | null = null): SandboxIsolationRules[] {
  return ACTION_KIND_GRAMMAR.map((kind) => deriveIsolationRules(kind, rootDir));
}

/**
 * Check whether an action kind is compatible with a workspace's isolation
 * rules (i.e., all required preconditions are configured).
 */
export function validateWorkspaceForAction(
  workspace: SandboxWorkspace,
  actionKind: DestructiveActionKind,
): { valid: boolean; missingRules: string[] } {
  const rules = deriveIsolationRules(actionKind, null);

  const missing: string[] = [];

  if (rules.requiresSeparateWorktree && !workspace.workspacePath) {
    missing.push('separate_worktree');
  }

  for (const cmd of rules.preValidationCommands) {
    const result = workspace.validationResults.find((r) => r.command === cmd);
    if (!result || !result.passed) {
      missing.push(`pre_validation:${cmd}`);
    }
  }

  return { valid: missing.length === 0, missingRules: missing };
}

// ────────────────────────────────────────────────────────────────────────────
// Sandbox State Construction
// ────────────────────────────────────────────────────────────────────────────

export function buildSandboxState(rootDir: string): SandboxState {
  const protectedFiles = loadProtectedFiles(rootDir);
  const destructiveActions = classifyDestructiveActions(rootDir);

  const governedSandboxActions = destructiveActions.filter((a) => a.requiresGovernedSandbox).length;
  const humanRequiredActions = 0;
  const sandboxOnlyActions = destructiveActions.filter((a) => a.sandboxOnly).length;
  const governanceViolations = destructiveActions.filter(
    (a) => a.kind.includes('governance') || a.kind.includes('protected'),
  ).length;

  const riskBreakdown = RISK_ORDER.reduce(
    (breakdown, level) => ({
      ...breakdown,
      [level]: destructiveActions.filter((a) => a.riskLevel === level).length,
    }),
    {} as Record<SandboxRiskLevel, number>,
  );

  const isolationRules = getAllIsolationRules(rootDir);

  const state: SandboxState = {
    generatedAt: new Date().toISOString(),
    destructiveActions,
    activeWorkspaces: [],
    protectedFiles,
    isolationRules,
    summary: {
      totalDestructiveActions: destructiveActions.length,
      humanRequiredActions,
      governedSandboxActions,
      sandboxOnlyActions,
      activeWorkspaces: 0,
      riskBreakdown,
      governanceViolations,
    },
  };

  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(state, null, 2));

  return state;
}

