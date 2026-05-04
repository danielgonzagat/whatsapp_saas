import * as fs from 'fs';
import * as path from 'path';
import type {
  RealSandboxProtectedBoundary,
  RealSandboxBlockedReason,
  RealSandboxPatchPlan,
} from './types';
import { resolveInsideRoot, classifyPath, normalizeRelPath, resolveRoot } from './path';
import { quoteCommandArg } from './path';

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
      const patchPath = normalizePatchFilePath(line.slice(4));
      if (patchPath) changed.add(patchPath);
    }
  }

  return [...changed].sort();
}

export function buildPatchPlan(
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
