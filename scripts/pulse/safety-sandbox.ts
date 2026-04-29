// PULSE — Live Codebase Nervous System
// Safety Sandbox (Wave 9)

import * as path from 'path';
import * as fs from 'fs';

import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  DestructiveAction,
  DestructiveActionKind,
  SandboxState,
} from './types.safety-sandbox';

const ARTIFACT_FILE_NAME = 'PULSE_SANDBOX_STATE.json';
const PROTECTED_FILES_PATH = 'ops/protected-governance-files.json';

interface ProtectedGovernanceConfig {
  protectedExact: string[];
  protectedPrefixes: string[];
}

/**
 * Action kind definitions with their safety requirements.
 *
 * Each destructive action kind carries a default set of requirements:
 * human approval, dry-run validation, backup creation, and sandbox-only execution.
 */
const ACTION_KIND_REQUIREMENTS: Record<
  DestructiveActionKind,
  {
    requiresHumanApproval: boolean;
    requiresDryRun: boolean;
    requiresBackup: boolean;
    sandboxOnly: boolean;
  }
> = {
  migration: {
    requiresHumanApproval: true,
    requiresDryRun: true,
    requiresBackup: true,
    sandboxOnly: false,
  },
  external_state_mutation: {
    requiresHumanApproval: true,
    requiresDryRun: true,
    requiresBackup: false,
    sandboxOnly: true,
  },
  access_boundary_change: {
    requiresHumanApproval: true,
    requiresDryRun: true,
    requiresBackup: true,
    sandboxOnly: true,
  },
  infra_change: {
    requiresHumanApproval: true,
    requiresDryRun: true,
    requiresBackup: true,
    sandboxOnly: true,
  },
  secret_access: {
    requiresHumanApproval: true,
    requiresDryRun: false,
    requiresBackup: false,
    sandboxOnly: true,
  },
  delete_operation: {
    requiresHumanApproval: true,
    requiresDryRun: true,
    requiresBackup: true,
    sandboxOnly: true,
  },
  governance_change: {
    requiresHumanApproval: true,
    requiresDryRun: false,
    requiresBackup: true,
    sandboxOnly: false,
  },
  protected_file_edit: {
    requiresHumanApproval: true,
    requiresDryRun: true,
    requiresBackup: true,
    sandboxOnly: false,
  },
};

/**
 * File patterns that signal destructive actions in the repository.
 *
 * Each entry maps a file path pattern to a destructive action kind.
 * When a file matching the pattern is detected in a proposed change,
 * the corresponding action kind is triggered.
 */
const DESTRUCTIVE_FILE_PATTERNS: Array<{
  pattern: RegExp;
  kind: DestructiveActionKind;
  description: string;
}> = [
  { pattern: /prisma\/migrations\//, kind: 'migration', description: 'Database migration change' },
  { pattern: /prisma\/schema\.prisma$/, kind: 'migration', description: 'Database schema change' },
  { pattern: /\.github\/workflows\//, kind: 'infra_change', description: 'CI/CD workflow change' },
  {
    pattern: /docker|dockerfile/i,
    kind: 'infra_change',
    description: 'Container/infrastructure change',
  },
  { pattern: /\.env/, kind: 'secret_access', description: 'Environment variable access' },
  { pattern: /secret|credential/i, kind: 'secret_access', description: 'Secret/credential access' },
  {
    pattern: /\.codacy\.yml$/,
    kind: 'governance_change',
    description: 'Codacy configuration change',
  },
  {
    pattern: /ops\/governance/,
    kind: 'governance_change',
    description: 'Governance configuration change',
  },
];

const EXTERNAL_MUTATION_RE =
  /\b(?:fetch|axios|httpService|request)\s*(?:<[^>]*>)?\s*\(|\.(?:post|put|patch|delete)\s*\(|\b(?:charge|transfer|refund|withdraw|deposit|capture|authorize|send|dispatch|publish)\w*\s*\(/i;
const ACCESS_BOUNDARY_RE =
  /\b(?:CanActivate|UseGuards|AuthGuard|guard|authorize|authenticate|permission|role|session|token|jwt|signature|verify)\b/i;
const DELETE_OPERATION_RE =
  /\b(?:deleteMany|delete\s*\(|remove\s*\(|truncate|drop\s+table|drop\s+column)\b/i;

function classifyStructuralDestructiveActions(
  relativePath: string,
  content: string,
): Array<{ kind: DestructiveActionKind; description: string }> {
  const actions: Array<{ kind: DestructiveActionKind; description: string }> = [];

  if (DELETE_OPERATION_RE.test(content)) {
    actions.push({ kind: 'delete_operation', description: 'Delete or drop operation detected' });
  }
  if (EXTERNAL_MUTATION_RE.test(content)) {
    actions.push({
      kind: 'external_state_mutation',
      description: 'External or persistent state mutation boundary detected',
    });
  }
  if (ACCESS_BOUNDARY_RE.test(content) || /\.guard\.(?:ts|tsx|js|jsx)$/.test(relativePath)) {
    actions.push({
      kind: 'access_boundary_change',
      description: 'Access-control boundary detected',
    });
  }

  return actions;
}

/**
 * Load the list of protected files from governance configuration.
 *
 * Reads `ops/protected-governance-files.json` and expands both
 * exact file paths and prefix-based patterns into a flat list
 * of protected target paths.
 *
 * @param rootDir - Repository root directory
 * @returns Array of protected file paths
 */
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

/**
 * Recursively expand a directory prefix into individual file paths.
 */
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

/**
 * Classify all potential destructive actions in the repository.
 *
 * Scans the repository file structure against known destructive patterns
 * and produces a classified action for each match with the appropriate
 * safety requirements.
 *
 * @param rootDir - Repository root directory
 * @returns Array of classified destructive actions
 */
export function classifyDestructiveActions(rootDir: string): DestructiveAction[] {
  const protectedFiles = loadProtectedFiles(rootDir);
  const actions: DestructiveAction[] = [];
  const seen = new Set<string>();

  // Walk the repository to find files matching destructive patterns
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
      if (entry.name.startsWith('.') && entry.name !== '.github') {
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
        for (const { pattern, kind, description } of DESTRUCTIVE_FILE_PATTERNS) {
          if (pattern.test(relative) && !seen.has(`${kind}:${relative}`)) {
            seen.add(`${kind}:${relative}`);
            const reqs = ACTION_KIND_REQUIREMENTS[kind];
            const isProtected = protectedFiles.some(
              (pf) => pf === relative || relative.startsWith(pf + path.sep),
            );

            actions.push({
              actionId: `${kind}:${relative}`,
              kind,
              description: `${description}: ${relative}`,
              targetFile: relative,
              requiresHumanApproval: reqs.requiresHumanApproval || isProtected,
              requiresDryRun: reqs.requiresDryRun,
              requiresBackup: reqs.requiresBackup,
              sandboxOnly: reqs.sandboxOnly,
            });
            break;
          }
        }

        let content = '';
        try {
          content = fs.readFileSync(full, 'utf8');
        } catch {
          content = '';
        }

        for (const { kind, description } of classifyStructuralDestructiveActions(
          relative,
          content,
        )) {
          if (seen.has(`${kind}:${relative}`)) continue;
          seen.add(`${kind}:${relative}`);
          const reqs = ACTION_KIND_REQUIREMENTS[kind];
          const isProtected = protectedFiles.some(
            (pf) => pf === relative || relative.startsWith(pf + path.sep),
          );

          actions.push({
            actionId: `${kind}:${relative}`,
            kind,
            description: `${description}: ${relative}`,
            targetFile: relative,
            requiresHumanApproval: reqs.requiresHumanApproval || isProtected,
            requiresDryRun: reqs.requiresDryRun,
            requiresBackup: reqs.requiresBackup,
            sandboxOnly: reqs.sandboxOnly,
          });
        }
      }
    }
  }

  walk(rootDir);
  return actions;
}

/**
 * Determine whether a destructive action is allowed to execute
 * autonomously (without explicit human approval at runtime).
 *
 * An action is allowed in autonomy only if:
 *   - It does NOT require human approval
 *   - It is NOT sandbox-only
 *   - It does NOT involve governance changes or protected files
 *
 * @param action - The destructive action to evaluate
 * @returns Whether the action is allowed in autonomous mode
 */
export function isActionAllowedInAutonomy(action: DestructiveAction): boolean {
  if (action.requiresHumanApproval) {
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

/**
 * Validate that a patch does not modify any protected files.
 *
 * Parses the patch header to extract modified file paths and checks
 * each against the list of protected files. Exact and prefix-based
 * matching is supported.
 *
 * @param patchFile - Path to the patch file to validate
 * @param protectedFiles - List of protected file paths
 * @returns Whether the patch is safe (touches no protected files)
 */
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

/**
 * Extract modified file paths from a unified diff patch string.
 */
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

/**
 * Build the complete Safety Sandbox state for the repository.
 *
 * Loads protected files, classifies all destructive actions, and
 * aggregates active sandbox workspace information. The result is
 * persisted to `.pulse/current/PULSE_SANDBOX_STATE.json`.
 *
 * @param rootDir - Repository root directory
 * @returns Complete sandbox state
 */
export function buildSandboxState(rootDir: string): SandboxState {
  const protectedFiles = loadProtectedFiles(rootDir);
  const destructiveActions = classifyDestructiveActions(rootDir);

  const humanRequiredActions = destructiveActions.filter((a) => a.requiresHumanApproval).length;
  const sandboxOnlyActions = destructiveActions.filter((a) => a.sandboxOnly).length;

  const state: SandboxState = {
    generatedAt: new Date().toISOString(),
    destructiveActions,
    activeWorkspaces: [], // Populated by autonomy-loop.workspace integration
    protectedFiles,
    summary: {
      totalDestructiveActions: destructiveActions.length,
      humanRequiredActions,
      sandboxOnlyActions,
      activeWorkspaces: 0,
    },
  };

  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(state, null, 2));

  return state;
}
