import * as path from 'path';

export const WORKSPACES = [
  'root',
  'backend',
  'frontend',
  'frontend-admin',
  'worker',
  'e2e',
] as const;
export type Workspace = (typeof WORKSPACES)[number];

export function isWorkspace(s: string): s is Workspace {
  return (WORKSPACES as readonly string[]).includes(s);
}

export const REPO_ROOT = path.resolve(process.cwd(), '..');

/**
 * Path-containment guard: resolve `candidate` (optionally relative to `base`)
 * and assert the result stays inside `base` (defaults to REPO_ROOT). Returns
 * the resolved absolute path. Throws if the path escapes the base directory,
 * preventing directory-traversal on every derived/non-literal filesystem path.
 */
export function assertWithinRepo(candidate: string, base: string = REPO_ROOT): string {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, candidate);
  const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  if (resolved !== resolvedBase && !resolved.startsWith(baseWithSep)) {
    throw new Error(`path_outside_base: ${candidate}`);
  }
  return resolved;
}

export function workspaceCoverageDir(ws: string): string {
  return assertWithinRepo(path.join(ws, 'coverage'));
}

export function looksLikeFilePath(s: string): boolean {
  return /[/\\]/.test(s) || /\.(ts|tsx|js|jsx)$/.test(s);
}

// Re-exports for backward compatibility — concerns now live in dedicated files.
export {
  SBOM_DIR,
  parseSbom,
  filterDeps,
  type DepResult,
  type SbomComponent,
  type SbomFile,
} from './deps-coverage.sbom.helpers';

export {
  fileCoverage,
  fileSimpleCoverage,
  simpleModuleCoverage,
  type CoverageResult,
  type CoverageSummary,
  type CoverageTotal,
  type CoverageDetailFile,
  type SimpleCoverage,
} from './deps-coverage.coverage.helpers';

export {
  affectedTestsImpl,
  parseImports,
  findImporters,
  type AffectedResult,
  type FileDeps,
} from './deps-coverage.imports.helpers';
