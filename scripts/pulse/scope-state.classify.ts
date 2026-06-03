import * as path from 'path';
import type { PulseConvergenceOwnerLane } from './types.gate-failure';
import type { PulseScopeFileKind, PulseScopeSurface } from './types.truth.scope';
import { ROOT_CONFIG_FILES } from './scope-state.constants/main';
import {
  discoverWorkspaceStructure,
  type WorkspaceStructure,
} from './scope-state.constants/workspace-walk';
import { normalizePath } from './scope-state.codacy';
import { discoverSourceExtensionsFromObservedTypescript } from './dynamic-reality-kernel/token-evidence';
import { deriveStringUnionMembersFromTypeContract } from './dynamic-reality-kernel/type-contract-labels';

/**
 * Path-classification helpers extracted from `scope-state.ts` so the parent
 * module stays under the 600-line touched-file cap. Each helper preserves
 * its original behaviour exactly.
 */

function isInsideRoot(relPath: string, root: string): boolean {
  return relPath === root || relPath.startsWith(`${root}/`);
}

function isProtectedByDiscoveredBoundary(relPath: string, structure: WorkspaceStructure): boolean {
  if (structure.protectedExact.has(relPath)) {
    return true;
  }
  return [...structure.protectedPrefixes].some((prefix) => relPath.startsWith(prefix));
}

function classifyPackageSurface(
  relPath: string,
  structure: WorkspaceStructure,
): PulseScopeSurface | null {
  const roots = [...structure.packageRoots, ...structure.sourceSignalRoots];
  const root = roots.find(
    (candidate) => candidate.surface !== 'misc' && isInsideRoot(relPath, candidate.root),
  );
  return root?.surface ?? null;
}

function classifyStructuralSurface(
  relPath: string,
  basename: string,
  structure: WorkspaceStructure,
): PulseScopeSurface | null {
  if ([...structure.prismaRoots].some((root) => isInsideRoot(relPath, root))) {
    return 'prisma';
  }
  if ([...structure.scriptRoots].some((root) => isInsideRoot(relPath, root))) {
    return 'scripts';
  }
  if ([...structure.tsconfigRoots].some((root) => isInsideRoot(relPath, root))) {
    return relPath.includes('/pulse/') ? 'scripts' : 'misc';
  }
  if ([...structure.infrastructureRoots].some((root) => isInsideRoot(relPath, root))) {
    return 'infra';
  }
  if (
    [...structure.documentRoots].some((root) => isInsideRoot(relPath, root)) ||
    basename.endsWith('.md')
  ) {
    return 'docs';
  }
  return null;
}

function isRootConfig(relPath: string, basename: string): boolean {
  if (relPath.includes('/')) {
    return false;
  }
  return (
    ROOT_CONFIG_FILES.has(basename) ||
    basename.startsWith('.') ||
    basename.endsWith('.json') ||
    basename.endsWith('.yml') ||
    basename.endsWith('.yaml') ||
    basename.endsWith('.config.js') ||
    basename.endsWith('.config.cjs') ||
    basename.endsWith('.config.mjs') ||
    basename.endsWith('.config.ts')
  );
}

/** Classify the high-level surface a file belongs to (frontend / backend / etc). */
export function classifySurface(
  relPath: string,
  protectedByGovernance: boolean,
  rootDir: string = process.cwd(),
): PulseScopeSurface {
  if (relPath.startsWith('PULSE_') || relPath === 'pulse.manifest.json') {
    return 'artifacts';
  }
  if (protectedByGovernance) {
    return 'governance';
  }
  const basename = path.basename(relPath);
  if (relPath.startsWith('.github/')) {
    return 'governance';
  }
  const structure = discoverWorkspaceStructure(rootDir);
  if (isProtectedByDiscoveredBoundary(relPath, structure)) {
    return 'governance';
  }
  const structuralSurface = classifyStructuralSurface(relPath, basename, structure);
  if (structuralSurface && structuralSurface !== 'misc') {
    return structuralSurface;
  }
  const packageSurface = classifyPackageSurface(relPath, structure);
  if (packageSurface) {
    return packageSurface;
  }
  if (isRootConfig(relPath, basename)) {
    return 'root-config';
  }
  return 'misc';
}

/** Classify a file as one of the PulseScopeFileKind buckets. */
/** Spec-file suffix list. Replaces a regex-DoS-flagged pattern with explicit
 * endsWith checks, which Semgrep recognises as safe. */
const SPEC_FILE_SUFFIXES = [
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
  '.spec.jsx',
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.test.jsx',
] as const;

/** True when the file path identifies a spec/test file. */
function isSpecPath(relPath: string, surface: PulseScopeSurface): boolean {
  if (surface === 'e2e' || relPath.includes('/__tests__/')) {
    return true;
  }
  return SPEC_FILE_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
}

/** True when the file is a TS/JS source belonging to a runtime or tooling surface. */
function isSourceFile(relPath: string, surface: PulseScopeSurface): boolean {
  const ext = path.extname(relPath);
  if (!discoverSourceExtensionsFromObservedTypescript().has(ext)) {
    return false;
  }
  return ['frontend', 'frontend-admin', 'backend', 'worker', 'e2e', 'scripts'].includes(surface);
}

export function classifyKind(relPath: string, surface: PulseScopeSurface): PulseScopeFileKind {
  if (surface === 'artifacts' || relPath.startsWith('PULSE_')) {
    return 'artifact';
  }
  if (surface === 'prisma' && path.basename(relPath) === 'migration.sql') {
    return 'migration';
  }
  if (isSpecPath(relPath, surface)) {
    return 'spec';
  }
  if (surface === 'docs' || path.extname(relPath) === '.md') {
    return 'document';
  }
  if (isSourceFile(relPath, surface)) {
    return 'source';
  }
  return 'config';
}

/**
 * Pick the most specific module-candidate token from a relative path,
 * skipping structural noise segments and short generic names.
 */
export function classifyModuleCandidate(
  relPath: string,
  rootDir: string = process.cwd(),
): string | null {
  const structure = discoverWorkspaceStructure(rootDir);
  const normalized = normalizePath(relPath).replace(/\.[^.]+$/, '');
  const segments = normalized
    .split('/')
    .map((segment) =>
      segment
        .replace(/\[[^\]]+\]/g, '')
        .replace(/^\([^)]*\)$/g, '')
        .replace(/\.(service|controller|module|route|page|layout|spec|test)$/, '')
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase(),
    )
    .filter(Boolean)
    .filter((segment) => !structure.structuralNoiseSegments.has(segment))
    .filter((segment) => !/^\d+$/.test(segment))
    .filter((segment) => segment.length >= 3);

  for (const segment of segments) {
    if (!segment.includes('-')) {
      return segment;
    }
  }

  for (const segment of segments) {
    const [head] = segment.split('-');
    if (head && !structure.structuralNoiseSegments.has(head) && head.length >= 3) {
      return head;
    }
  }
  return null;
}

/** Pick the convergence owner lane responsible for a file. */
function discoverOwnerLaneLabels(): PulseConvergenceOwnerLane[] {
  return [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.gate-failure.ts',
      'PulseConvergenceOwnerLane',
    ),
  ] as PulseConvergenceOwnerLane[];
}

function laneMatchesObservedPath(
  lane: PulseConvergenceOwnerLane,
  normalized: string,
  surface: PulseScopeSurface,
  moduleCandidate: string | null,
): boolean {
  const haystack = normalizePath([normalized, surface, moduleCandidate || ''].join('/'));
  return lane
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .some((token) => haystack.includes(token.toLowerCase()));
}

function findOwnerLane(
  normalized: string,
  surface: PulseScopeSurface,
  moduleCandidate: string | null,
): PulseConvergenceOwnerLane | null {
  return (
    discoverOwnerLaneLabels().find((lane) =>
      laneMatchesObservedPath(lane, normalized, surface, moduleCandidate),
    ) ?? null
  );
}

export function classifyOwnerLane(
  relPath: string,
  surface: PulseScopeSurface,
  moduleCandidate: string | null,
  protectedByGovernance: boolean,
): PulseConvergenceOwnerLane {
  const normalized = relPath.toLowerCase();
  const discoveredLane = findOwnerLane(normalized, surface, moduleCandidate);

  if (protectedByGovernance || surface === 'governance' || surface === 'docs') {
    return 'platform';
  }
  if (discoveredLane) {
    return discoveredLane;
  }
  return 'platform';
}

/** Decide whether a given (surface,kind) tuple is runtime-critical. */
export function isRuntimeCritical(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  if (kind === 'source' || kind === 'migration') {
    return true;
  }
  return surface === 'infra' || surface === 'root-config';
}

/** Decide whether a given (surface,kind) tuple is user-facing. */
export function isUserFacing(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  return surface === 'frontend' || surface === 'frontend-admin';
}

/** Return a human-readable reason when a directory is excluded from the scope walk. */
export function classifyExcludeReason(dirName: string): string {
  return `${dirName} excluded by discovered walk policy`;
}

/** Return true when a file could not be classified into any known surface. */
export function isUnknownFile(surface: PulseScopeSurface, _kind: PulseScopeFileKind): boolean {
  return surface === 'misc';
}
