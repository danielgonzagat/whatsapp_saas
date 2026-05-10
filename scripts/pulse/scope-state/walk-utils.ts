import * as path from 'path';
import { pathExists, readDir, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import type { PulseCodacySummary } from '../../types.truth.codacy';
import type { PulseScopeExcludedFile, PulseScopeFile } from '../../types.truth.scope';
import {
  IGNORED_DIRECTORIES,
  ROOT_CONFIG_FILES,
  SCANNABLE_EXTENSIONS,
} from '../../scope-state.constants/main';
import { normalizePath } from '../../scope-state.codacy';
import {
  classifyExcludeReason,
  classifyKind,
  classifyModuleCandidate,
  classifyOwnerLane,
  classifySurface,
  isRuntimeCritical,
  isUserFacing,
} from '../../scope-state.classify';

/**
 * Resolve `segments` against `rootDir`, asserting the result lives inside the
 * root. Used by every fs-bound path construction in this module so the join
 * is verified before reaching pathExists/readDir/readTextFile.
 */
function resolveInside(rootDir: string, ...segments: string[]): string {
  return safeJoin(rootDir, ...segments);
}

export interface GovernanceBoundary {
  protectedExact: Set<string>;
  protectedPrefixes: string[];
}

export function createZeroRecord<K extends string>(keys: K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

export function createSurfaceCountRecord(): Record<PulseScopeFile['surface'], number> {
  return createZeroRecord<PulseScopeFile['surface']>([
    'frontend',
    'frontend-admin',
    'backend',
    'worker',
    'prisma',
    'e2e',
    'scripts',
    'docs',
    'infra',
    'governance',
    'root-config',
    'artifacts',
    'misc',
  ]);
}

export function createKindCountRecord(): Record<PulseScopeFile['kind'], number> {
  return createZeroRecord<PulseScopeFile['kind']>([
    'source',
    'spec',
    'migration',
    'config',
    'document',
    'artifact',
  ]);
}

export function loadGovernanceBoundary(rootDir: string): GovernanceBoundary {
  const defaultBoundary: GovernanceBoundary = {
    protectedExact: new Set<string>(),
    protectedPrefixes: [],
  };
  const boundaryPath = resolveInside(rootDir, 'ops', 'protected-governance-files.json');
  if (!pathExists(boundaryPath)) {
    return defaultBoundary;
  }

  try {
    const parsed = JSON.parse(readTextFile(boundaryPath, 'utf8')) as {
      protectedExact?: string[];
      protectedPrefixes?: string[];
    };
    return {
      protectedExact: new Set((parsed.protectedExact || []).map(normalizePath)),
      protectedPrefixes: (parsed.protectedPrefixes || []).map(normalizePath),
    };
  } catch {
    return defaultBoundary;
  }
}

export function isProtectedFile(relPath: string, boundary: GovernanceBoundary): boolean {
  if (boundary.protectedExact.has(relPath)) {
    return true;
  }
  return boundary.protectedPrefixes.some((prefix) => relPath.startsWith(prefix));
}

export function shouldIgnoreDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name);
}

export function isScannableFile(
  relPath: string,
  observedGeneratedArtifactPaths: Set<string>,
): boolean {
  if (relPath.startsWith('.pulse/')) {
    return false;
  }
  if (relPath.startsWith('.claude/') || relPath.startsWith('.copilot/')) {
    return false;
  }
  if (
    (relPath.startsWith('PULSE_') && relPath !== 'PULSE_CODACY_STATE.json') ||
    relPath === 'AUDIT_FEATURE_MATRIX.md' ||
    relPath === 'KLOEL_PRODUCT_MAP.md'
  ) {
    return observedGeneratedArtifactPaths.has(relPath);
  }
  const basename = path.basename(relPath);
  if (basename === 'Dockerfile' || basename.startsWith('Dockerfile.')) {
    return true;
  }
  if (ROOT_CONFIG_FILES.has(basename)) {
    return true;
  }
  return SCANNABLE_EXTENSIONS.has(path.extname(relPath));
}

export function readLineCount(filePath: string): number {
  try {
    return readTextFile(filePath, 'utf8').split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

export function walkScopeFiles(
  rootDir: string,
  currentDir: string,
  boundary: GovernanceBoundary,
  codacy: PulseCodacySummary,
  observedGeneratedArtifactPaths: Set<string>,
  files: PulseScopeFile[],
  excludedFiles: PulseScopeExcludedFile[],
) {
  for (const entry of readDir(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory() && shouldIgnoreDirectory(entry.name)) {
      const absolutePath = resolveInside(rootDir, path.relative(rootDir, currentDir), entry.name);
      const relPath = normalizePath(path.relative(rootDir, absolutePath));
      excludedFiles.push({
        path: relPath,
        excludeReason: classifyExcludeReason(entry.name),
      });
      continue;
    }

    const absolutePath = resolveInside(rootDir, path.relative(rootDir, currentDir), entry.name);
    const relPath = normalizePath(path.relative(rootDir, absolutePath));
    if (entry.isDirectory()) {
      walkScopeFiles(
        rootDir,
        absolutePath,
        boundary,
        codacy,
        observedGeneratedArtifactPaths,
        files,
        excludedFiles,
      );
      continue;
    }

    if (!isScannableFile(relPath, observedGeneratedArtifactPaths)) {
      continue;
    }

    const protectedByGovernance = isProtectedFile(relPath, boundary);
    const surface = classifySurface(relPath, protectedByGovernance, rootDir);
    const kind = classifyKind(relPath, surface);
    const moduleCandidate = classifyModuleCandidate(relPath, rootDir);
    const ownerLane = classifyOwnerLane(relPath, surface, moduleCandidate, protectedByGovernance);
    const topFile = codacy.topFiles.find((item) => item.filePath === relPath) || null;
    const highIssues = codacy.highPriorityBatch.filter((item) => item.filePath === relPath);
    const highestObservedSeverity =
      highIssues.find((issue) => issue.severityLevel === 'HIGH')?.severityLevel ||
      highIssues[0]?.severityLevel ||
      topFile?.highestSeverity ||
      null;

    files.push({
      path: relPath,
      extension: path.extname(relPath) || path.basename(relPath),
      lineCount: readLineCount(absolutePath),
      surface,
      kind,
      runtimeCritical: isRuntimeCritical(surface, kind),
      userFacing: isUserFacing(surface, kind),
      ownerLane,
      executionMode: protectedByGovernance ? 'observation_only' : 'ai_safe',
      protectedByGovernance,
      codacyTracked: true,
      moduleCandidate,
      observedCodacyIssueCount: topFile?.issueCount || 0,
      highSeverityIssueCount: highIssues.filter((issue) => issue.severityLevel === 'HIGH').length,
      highestObservedSeverity,
    });
  }
}
