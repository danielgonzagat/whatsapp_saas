import * as fs from 'fs';
import * as path from 'path';

import type {
  RealSandboxCommandPlan,
  RealSandboxPatchPlan,
  RealSandboxProtectedBoundary,
  RealSandboxBlockedReason,
  RealSandboxWorkspacePlan,
  BuildRealSandboxPlanInput,
} from './types';
import {
  resolveRoot,
  resolveInsideRoot,
  normalizeRelPath,
  normalizePrefix,
  pathSegments,
  unique,
  isProtectedPath,
  classifyPath,
  normalizeCommand,
  quoteCommandArg,
  stableWorkspaceId,
  observedPlanStatusSet,
  evidenceStatusBlocked,
  evidenceStatusPlanned,
  evidenceStatusNotRequired,
  planStatusReady,
  planStatusBlocked,
  kernelHeaderPrefixLength,
} from './kernel';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { pathExists, readJsonFile } from '../../safe-fs';

const DEFAULT_PROTECTED_BOUNDARY: RealSandboxProtectedBoundary = {
  protectedExact: [
    'AGENTS.md',
    'CLAUDE.md',
    'CODEX.md',
    '.codacy.yml',
    'package.json',
    '.husky/pre-push',
    'backend/eslint.config.mjs',
    'frontend/eslint.config.mjs',
    'worker/eslint.config.mjs',
  ],
  protectedPrefixes: ['.github/workflows/', 'docs/codacy/', 'docs/design/', 'ops/', 'scripts/ops/'],
};

const GOVERNANCE_BOUNDARY_PATH = 'ops/protected-governance-files.json';
const APPROVED_COMMAND_RE =
  /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:lint|typecheck|test|build|check(?::[\w-]+)?|pulse(?::[\w-]+)?)\b|npx\s+vitest\s+run\b|node\s+scripts\/pulse\/run\.js\b|git\s+(?:status|diff|show|log|branch)\b)/;
const VALIDATION_COMMAND_RE =
  /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:lint|typecheck|test|build|check(?::[\w-]+)?|pulse(?::[\w-]+)?)\b|npx\s+vitest\s+run\b|node\s+scripts\/pulse\/run\.js\b)/;
const DESTRUCTIVE_COMMAND_RE =
  /\b(?:rm\s+-[A-Za-z]*r[A-Za-z]*|git\s+(?:reset|restore|checkout|clean|push|rebase|commit)|prisma\s+(?:migrate\s+(?:dev|deploy|reset|resolve)|db\s+push)|(?:drop|truncate)\s+(?:table|database|schema)|delete\s+from|migration\s+reset)\b/i;

function loadProtectedBoundary(rootDir: string): RealSandboxProtectedBoundary {
  const boundaryPath = path.join(resolveRoot(rootDir), GOVERNANCE_BOUNDARY_PATH);
  if (!pathExists(boundaryPath)) {
    return DEFAULT_PROTECTED_BOUNDARY;
  }

  try {
    const parsed = readJsonFile<{
      protectedExact?: string[];
      protectedPrefixes?: string[];
    }>(boundaryPath);
    return {
      protectedExact: parsed.protectedExact ?? DEFAULT_PROTECTED_BOUNDARY.protectedExact,
      protectedPrefixes: parsed.protectedPrefixes ?? DEFAULT_PROTECTED_BOUNDARY.protectedPrefixes,
    };
  } catch {
    return DEFAULT_PROTECTED_BOUNDARY;
  }
}

function normalizePatchFilePath(candidate: string): string | null {
  const normalized = normalizeRelPath(candidate.trim());
  if (normalized === '/dev/null' || normalized === 'dev/null') {
    return null;
  }
  return normalized.replace(/^(?:a|b)\//, '');
}

function extractChangedFilesFromPatch(patchContent: string): string[] {
  const changed = new Set<string>();

  for (const line of patchContent.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git\s+a\/(.+?)\s+b\/(.+)$/.exec(line);
      if (match) {
        const beforePath = normalizePatchFilePath(match[1]);
        const afterPath = normalizePatchFilePath(match[2]);
        if (beforePath) changed.add(beforePath);
        if (afterPath) changed.add(afterPath);
      }
      continue;
    }

    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      const patchPath = normalizePatchFilePath(line.slice(kernelHeaderPrefixLength()));
      if (patchPath) changed.add(patchPath);
    }
  }

  return [...changed].sort();
}

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
  if (blockedReasons.length === deriveZeroValue()) {
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
    status: blockedReasons.length > deriveZeroValue() ? 'blocked' : 'ready',
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
    status: blockedReasons.length > deriveZeroValue() ? planStatusBlocked() : planStatusReady(),
    touchedPaths: unique([...touchedPaths, ...patch.changedFiles]).sort(),
    commands,
    patch,
    lifecycle: {
      workspaceCreated:
        blockedReasons.length > deriveZeroValue()
          ? evidenceStatusBlocked()
          : evidenceStatusPlanned(),
      workspaceMaterialized:
        blockedReasons.length > deriveZeroValue()
          ? evidenceStatusBlocked()
          : evidenceStatusPlanned(),
      patchChecked: !observedPlanStatusSet().has(patch.status)
        ? evidenceStatusNotRequired()
        : blockedReasons.length > deriveZeroValue()
          ? evidenceStatusBlocked()
          : evidenceStatusPlanned(),
      patchApplied: !observedPlanStatusSet().has(patch.status)
        ? evidenceStatusNotRequired()
        : blockedReasons.length > deriveZeroValue()
          ? evidenceStatusBlocked()
          : evidenceStatusPlanned(),
      validationPassed:
        commands.length === deriveZeroValue()
          ? evidenceStatusNotRequired()
          : blockedReasons.length > deriveZeroValue()
            ? evidenceStatusBlocked()
            : evidenceStatusPlanned(),
    },
    blockedReasons,
    isolatedWorkspacePathPlan: {
      strategy: 'directory_workspace',
      sourceRoot: rootDir,
      workspacePath,
    },
  };
}
