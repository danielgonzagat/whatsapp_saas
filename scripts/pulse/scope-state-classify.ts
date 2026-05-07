/** Classification helpers and constants for scope-state. */

import * as path from 'path';
import { pathExists, readTextFile } from './safe-fs';
import { safeJoin } from './lib/safe-path';
import type { PulseConvergenceOwnerLane } from './types.gate-failure';
import type { PulseScopeFileKind, PulseScopeSurface } from './types.truth.scope';
import { deriveStringUnionMembersFromTypeContract } from './dynamic-reality-kernel/__parts__/type-contract-labels';
import {
  classifyKind as classifyKindDynamic,
  classifySurface as classifySurfaceDynamic,
} from './scope-state.classify';
import {
  SCANNABLE_EXTENSIONS,
  IGNORED_DIRECTORIES,
  ROOT_CONFIG_FILES,
  STRUCTURAL_NOISE_SEGMENTS,
} from './scope-state-constants';

export {
  SCANNABLE_EXTENSIONS,
  IGNORED_DIRECTORIES,
  ROOT_CONFIG_FILES,
} from './scope-state-constants';

export interface GovernanceBoundary {
  protectedExact: Set<string>;
  protectedPrefixes: string[];
}

export function normalizePath(input: string): string {
  return input.split(path.sep).join('/').replace(/^\.\//, '');
}

export function normalizeSeverity(
  value: string | undefined | null,
): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return normalized;
  }
  return 'UNKNOWN';
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

export function createSurfaceCountRecord(): Record<PulseScopeSurface, number> {
  return Object.fromEntries(
    [
      ...deriveStringUnionMembersFromTypeContract(
        'scripts/pulse/types.truth.scope.ts',
        'PulseScopeSurface',
      ),
    ].map((surface) => [surface, 0]),
  ) as Record<PulseScopeSurface, number>;
}

export function createKindCountRecord(): Record<PulseScopeFileKind, number> {
  return Object.fromEntries(
    [
      ...deriveStringUnionMembersFromTypeContract(
        'scripts/pulse/types.truth.scope.ts',
        'PulseScopeFileKind',
      ),
    ].map((kind) => [kind, 0]),
  ) as Record<PulseScopeFileKind, number>;
}

export function loadGovernanceBoundary(rootDir: string): GovernanceBoundary {
  const defaultBoundary: GovernanceBoundary = {
    protectedExact: new Set<string>(),
    protectedPrefixes: [],
  };
  const boundaryPath = safeJoin(rootDir, 'ops', 'protected-governance-files.json');
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
    /^PULSE_(?!CODACY_STATE\.json$)/.test(relPath) ||
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

export function classifySurface(
  relPath: string,
  protectedByGovernance: boolean,
): PulseScopeSurface {
  return classifySurfaceDynamic(relPath, protectedByGovernance);
}

export function classifyKind(relPath: string, surface: PulseScopeSurface): PulseScopeFileKind {
  return classifyKindDynamic(relPath, surface);
}

export function classifyModuleCandidate(relPath: string): string | null {
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
    .filter((segment) => !STRUCTURAL_NOISE_SEGMENTS.has(segment))
    .filter((segment) => !/^\d+$/.test(segment))
    .filter((segment) => segment.length >= 3);

  for (const segment of segments) {
    if (!segment.includes('-')) {
      return segment;
    }
  }

  for (const segment of segments) {
    const [head] = segment.split('-');
    if (head && !STRUCTURAL_NOISE_SEGMENTS.has(head) && head.length >= 3) {
      return head;
    }
  }
  return null;
}

export function classifyOwnerLane(
  relPath: string,
  surface: PulseScopeSurface,
  moduleCandidate: string | null,
  protectedByGovernance: boolean,
): PulseConvergenceOwnerLane {
  const normalized = relPath.toLowerCase();
  const moduleToken = moduleCandidate || '';
  const laneLabels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.gate-failure.ts',
    'PulseConvergenceOwnerLane',
  ) as Set<PulseConvergenceOwnerLane>;
  const laneMatchesObservedPath = (lane: PulseConvergenceOwnerLane): boolean => {
    const tokens = lane.split('-').filter(Boolean);
    return tokens.some(
      (token) =>
        normalized.includes(token) || moduleToken.includes(token) || surface.includes(token),
    );
  };

  if (protectedByGovernance || surface === 'governance' || surface === 'docs') {
    return 'platform';
  }
  for (const lane of laneLabels) {
    if (lane !== 'platform' && laneMatchesObservedPath(lane)) {
      return lane;
    }
  }
  return 'platform';
}

export function isRuntimeCritical(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  if (kind === 'source' || kind === 'migration') {
    return true;
  }
  return surface === 'infra' || surface === 'root-config';
}

export function isUserFacing(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  return surface === 'frontend' || surface === 'frontend-admin';
}
