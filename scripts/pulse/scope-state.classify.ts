import * as path from 'path';
import type { PulseConvergenceOwnerLane, PulseScopeFileKind, PulseScopeSurface } from './types';
import { ROOT_CONFIG_FILES, STRUCTURAL_NOISE_SEGMENTS } from './scope-state.constants';
import { normalizePath } from './scope-state.codacy';

/**
 * Path-classification helpers extracted from `scope-state.ts` so the parent
 * module stays under the 600-line touched-file cap. Each helper preserves
 * its original behaviour exactly.
 */

/** Classify the high-level surface a file belongs to (frontend / backend / etc). */
export function classifySurface(
  relPath: string,
  protectedByGovernance: boolean,
): PulseScopeSurface {
  const basename = path.basename(relPath);
  if (relPath.startsWith('PULSE_')) {
    return 'artifacts';
  }
  if (protectedByGovernance || relPath.startsWith('.github/')) {
    return 'governance';
  }
  if (relPath.startsWith('frontend/src/')) {
    return 'frontend';
  }
  if (relPath.startsWith('frontend-admin/src/')) {
    return 'frontend-admin';
  }
  if (relPath.startsWith('backend/src/')) {
    return 'backend';
  }
  if (relPath.startsWith('worker/src/') || relPath.startsWith('worker/')) {
    return 'worker';
  }
  if (relPath.startsWith('backend/prisma/') || relPath.startsWith('prisma/')) {
    return 'prisma';
  }
  if (relPath.startsWith('e2e/')) {
    return 'e2e';
  }
  if (relPath.startsWith('scripts/')) {
    return 'scripts';
  }
  if (relPath.startsWith('docs/')) {
    return 'docs';
  }
  if (
    relPath.startsWith('docker/') ||
    relPath.startsWith('nginx/') ||
    basename.startsWith('Dockerfile')
  ) {
    return 'infra';
  }
  if (
    ROOT_CONFIG_FILES.has(basename) ||
    relPath === '.codacy.yml' ||
    relPath.startsWith('.husky/')
  ) {
    return 'root-config';
  }
  return 'misc';
}

/** Classify a file as one of the PulseScopeFileKind buckets. */
export function classifyKind(relPath: string, surface: PulseScopeSurface): PulseScopeFileKind {
  const basename = path.basename(relPath);
  if (surface === 'artifacts' || relPath.startsWith('PULSE_')) {
    return 'artifact';
  }
  if (
    relPath.startsWith('backend/prisma/migrations/') ||
    relPath.startsWith('prisma/migrations/')
  ) {
    return 'migration';
  }
  if (
    relPath.includes('/__tests__/') ||
    /\.spec\.[jt]sx?$/.test(relPath) ||
    /\.test\.[jt]sx?$/.test(relPath) ||
    surface === 'e2e'
  ) {
    return 'spec';
  }
  if (surface === 'docs' || path.extname(relPath) === '.md') {
    return 'document';
  }
  if (
    path.extname(relPath) === '.ts' ||
    path.extname(relPath) === '.tsx' ||
    path.extname(relPath) === '.js' ||
    path.extname(relPath) === '.jsx' ||
    path.extname(relPath) === '.mjs' ||
    path.extname(relPath) === '.cjs'
  ) {
    if (
      relPath.includes('/src/') ||
      relPath.startsWith('frontend/') ||
      relPath.startsWith('backend/')
    ) {
      return 'source';
    }
  }
  if (basename === 'Dockerfile' || basename.startsWith('Dockerfile.')) {
    return 'config';
  }
  return 'config';
}

/**
 * Pick the most specific module-candidate token from a relative path,
 * skipping structural noise segments and short generic names.
 */
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

/** Pick the convergence owner lane responsible for a file. */
export function classifyOwnerLane(
  relPath: string,
  surface: PulseScopeSurface,
  moduleCandidate: string | null,
  protectedByGovernance: boolean,
): PulseConvergenceOwnerLane {
  const normalized = relPath.toLowerCase();
  if (protectedByGovernance || surface === 'governance' || surface === 'docs') {
    return 'platform';
  }
  if (
    normalized.includes('/security/') ||
    normalized.includes('/audit/') ||
    normalized.includes('/rbac/') ||
    normalized.includes('/permissions/')
  ) {
    return 'security';
  }
  if (
    surface === 'worker' ||
    surface === 'prisma' ||
    surface === 'infra' ||
    surface === 'root-config' ||
    normalized.includes('/health/') ||
    normalized.includes('/metrics') ||
    normalized.includes('/observability/') ||
    normalized.includes('/alerts/')
  ) {
    return 'reliability';
  }
  if (surface === 'frontend-admin') {
    return 'operator-admin';
  }
  if (surface === 'frontend') {
    return 'customer';
  }
  if (
    surface === 'backend' &&
    (normalized.includes('/admin/') ||
      normalized.includes('/internal/') ||
      normalized.includes('/dashboard/'))
  ) {
    return 'operator-admin';
  }
  if (surface === 'backend') {
    return 'customer';
  }
  if (moduleCandidate && moduleCandidate.includes('admin')) {
    return 'operator-admin';
  }
  return 'platform';
}

/** Decide whether a given (surface,kind) tuple is runtime-critical. */
export function isRuntimeCritical(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  return [
    'frontend',
    'frontend-admin',
    'backend',
    'worker',
    'prisma',
    'infra',
    'root-config',
  ].includes(surface);
}

/** Decide whether a given (surface,kind) tuple is user-facing. */
export function isUserFacing(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  return surface === 'frontend' || surface === 'frontend-admin';
}
