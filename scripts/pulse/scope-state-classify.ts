/** Classification helpers and constants for scope-state. */

import * as path from 'path';
import { pathExists, readTextFile } from './safe-fs';
import type { PulseConvergenceOwnerLane, PulseScopeFileKind, PulseScopeSurface } from './types';

export const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.md',
  '.yml',
  '.yaml',
  '.json',
  '.css',
  '.scss',
]);
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.pulse',
  '.claude',
  '.copilot',
  'dist',
  '.next',
  '.turbo',
  'build',
  'coverage',
  '.cache',
  '.vercel',
]);
export const ROOT_CONFIG_FILES = new Set([
  'package.json',
  'package-lock.json',
  '.dockerignore',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.tool-versions',
  'railpack-plan.json',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

const STRUCTURAL_NOISE_SEGMENTS = new Set([
  '',
  'backend',
  'frontend',
  'frontend-admin',
  'worker',
  'src',
  'app',
  'apps',
  'pages',
  'page',
  'route',
  'routes',
  'api',
  'components',
  'component',
  'hooks',
  'hook',
  'lib',
  'libs',
  'utils',
  'util',
  'common',
  'shared',
  'module',
  'modules',
  'feature',
  'features',
  'provider',
  'providers',
  'context',
  'contexts',
  'types',
  'scripts',
  'docs',
  'prisma',
  'migrations',
  'generated',
  'tests',
  'test',
  'spec',
  'specs',
  '__tests__',
  'ops',
  'nginx',
  'docker',
  'layout',
  'loading',
  'error',
  'template',
  'index',
]);

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
  return {
    frontend: 0,
    'frontend-admin': 0,
    backend: 0,
    worker: 0,
    prisma: 0,
    e2e: 0,
    scripts: 0,
    docs: 0,
    infra: 0,
    governance: 0,
    'root-config': 0,
    artifacts: 0,
    misc: 0,
  };
}

export function createKindCountRecord(): Record<PulseScopeFileKind, number> {
  return {
    source: 0,
    spec: 0,
    migration: 0,
    config: 0,
    document: 0,
    artifact: 0,
  };
}

export function loadGovernanceBoundary(rootDir: string): GovernanceBoundary {
  const defaultBoundary: GovernanceBoundary = {
    protectedExact: new Set<string>(),
    protectedPrefixes: [],
  };
  const boundaryPath = path.join(rootDir, 'ops', 'protected-governance-files.json');
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

export function isUserFacing(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  return surface === 'frontend' || surface === 'frontend-admin';
}
