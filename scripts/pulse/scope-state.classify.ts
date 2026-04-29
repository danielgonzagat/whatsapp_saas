import * as path from 'path';
import type { PulseConvergenceOwnerLane, PulseScopeFileKind, PulseScopeSurface } from './types';
import { ROOT_CONFIG_FILES, STRUCTURAL_NOISE_SEGMENTS } from './scope-state.constants';
import { normalizePath } from './scope-state.codacy';

/**
 * Path-classification helpers extracted from `scope-state.ts` so the parent
 * module stays under the 600-line touched-file cap. Each helper preserves
 * its original behaviour exactly.
 */

/**
 * Surface lookup table — each entry pairs a fast prefix predicate with the
 * surface label it implies. The table is consulted in order so callers can
 * preserve the historical priority (artifacts > governance > frontends > ...).
 *
 * Centralizing the rules here also drops `classifySurface`'s cyclomatic
 * complexity well below the Codacy/Lizard threshold without changing behavior.
 */
const SURFACE_RULES: ReadonlyArray<{
  match: (relPath: string, basename: string) => boolean;
  surface: PulseScopeSurface;
}> = [
  { match: (p) => p.startsWith('PULSE_'), surface: 'artifacts' },
  { match: (p) => p.startsWith('.github/'), surface: 'governance' },
  // frontend-admin/ must come BEFORE frontend/ to avoid being swallowed
  { match: (p) => p.startsWith('frontend-admin/'), surface: 'frontend-admin' },
  { match: (p) => p.startsWith('frontend/'), surface: 'frontend' },
  { match: (p) => p.startsWith('backend/'), surface: 'backend' },
  { match: (p) => p.startsWith('worker/src/') || p.startsWith('worker/'), surface: 'worker' },
  {
    match: (p) => p.startsWith('backend/prisma/') || p.startsWith('prisma/'),
    surface: 'prisma',
  },
  { match: (p) => p.startsWith('e2e/'), surface: 'e2e' },
  { match: (p) => p.startsWith('scripts/'), surface: 'scripts' },
  {
    match: (p) => p.startsWith('docs/') || (!p.includes('/') && p.endsWith('.md')),
    surface: 'docs',
  },
  {
    match: (p, base) =>
      p.startsWith('docker/') || p.startsWith('nginx/') || base.startsWith('Dockerfile'),
    surface: 'infra',
  },
  {
    match: (p, base) =>
      ROOT_CONFIG_FILES.has(base) ||
      p === '.codacy.yml' ||
      p.startsWith('.husky/') ||
      (!p.includes('/') && base.startsWith('.')),
    surface: 'root-config',
  },
];

/** Classify the high-level surface a file belongs to (frontend / backend / etc). */
export function classifySurface(
  relPath: string,
  protectedByGovernance: boolean,
): PulseScopeSurface {
  if (relPath.startsWith('PULSE_') || relPath === 'pulse.manifest.json') {
    return 'artifacts';
  }
  if (protectedByGovernance) {
    return 'governance';
  }
  const basename = path.basename(relPath);
  for (const rule of SURFACE_RULES) {
    if (rule.match(relPath, basename)) {
      return rule.surface;
    }
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

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** True when the file path identifies a spec/test file. */
function isSpecPath(relPath: string, surface: PulseScopeSurface): boolean {
  if (surface === 'e2e' || relPath.includes('/__tests__/')) {
    return true;
  }
  return SPEC_FILE_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
}

/** True when the file is a TS/JS source belonging to an app surface. */
function isSourceFile(relPath: string): boolean {
  const ext = path.extname(relPath);
  if (!SOURCE_EXTENSIONS.includes(ext as (typeof SOURCE_EXTENSIONS)[number])) {
    return false;
  }
  return (
    relPath.includes('/src/') || relPath.startsWith('frontend/') || relPath.startsWith('backend/')
  );
}

export function classifyKind(relPath: string, surface: PulseScopeSurface): PulseScopeFileKind {
  if (surface === 'artifacts' || relPath.startsWith('PULSE_')) {
    return 'artifact';
  }
  if (
    relPath.startsWith('backend/prisma/migrations/') ||
    relPath.startsWith('prisma/migrations/')
  ) {
    return 'migration';
  }
  if (isSpecPath(relPath, surface)) {
    return 'spec';
  }
  if (surface === 'docs' || path.extname(relPath) === '.md') {
    return 'document';
  }
  if (isSourceFile(relPath)) {
    return 'source';
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
const SECURITY_LANE_SEGMENTS = [
  '/auth/',
  '/security/',
  '/audit/',
  '/rbac/',
  '/permissions/',
  '/policy/',
] as const;
const RELIABILITY_LANE_SEGMENTS = [
  '/health/',
  '/metrics',
  '/observability/',
  '/alerts/',
  '/telemetry/',
  '/queue/',
  '/jobs/',
  '/logging/',
] as const;
const RELIABILITY_LANE_SURFACES: ReadonlySet<PulseScopeSurface> = new Set([
  'worker',
  'prisma',
  'infra',
  'root-config',
]);
const OPERATOR_LANE_SEGMENTS = [
  '/admin/',
  '/internal/',
  '/operator/',
  '/backoffice/',
  '/dashboard/',
] as const;
const USER_ENTRY_SEGMENTS = [
  '/page.',
  '/pages/',
  '/route.',
  '/routes/',
  '/controller.',
  '/controllers/',
  '/public/',
] as const;

function matchesAnySegment(value: string, segments: ReadonlyArray<string>): boolean {
  return segments.some((segment) => value.includes(segment));
}

function isSecurityLane(normalized: string): boolean {
  return matchesAnySegment(normalized, SECURITY_LANE_SEGMENTS);
}

function isReliabilityLane(normalized: string, surface: PulseScopeSurface): boolean {
  return (
    RELIABILITY_LANE_SURFACES.has(surface) ||
    matchesAnySegment(normalized, RELIABILITY_LANE_SEGMENTS)
  );
}

function matchesAnyToken(value: string | null, tokens: ReadonlyArray<string>): boolean {
  if (!value) {
    return false;
  }
  return tokens.some((token) => value.includes(token.replace(/\//g, '')));
}

function isOperatorLane(normalized: string, moduleCandidate: string | null): boolean {
  return (
    matchesAnySegment(normalized, OPERATOR_LANE_SEGMENTS) ||
    matchesAnyToken(moduleCandidate, OPERATOR_LANE_SEGMENTS)
  );
}

function isUserEntrySurface(normalized: string, surface: PulseScopeSurface): boolean {
  if (surface === 'frontend' || surface === 'frontend-admin') {
    return true;
  }
  return matchesAnySegment(normalized, USER_ENTRY_SEGMENTS);
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
  if (isSecurityLane(normalized)) {
    return 'security';
  }
  if (isReliabilityLane(normalized, surface)) {
    return 'reliability';
  }
  if (isOperatorLane(normalized, moduleCandidate)) {
    return 'operator-admin';
  }
  if (surface === 'frontend-admin') {
    return 'operator-admin';
  }
  if (isUserEntrySurface(normalized, surface)) {
    return 'customer';
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
  const reasons: Record<string, string> = {
    node_modules: 'third-party dependencies',
    '.git': 'version control data',
    '.pulse': 'pulse artifact directory',
    '.claude': 'claude configuration',
    '.copilot': 'copilot configuration',
    dist: 'build output',
    '.next': 'next.js build output',
    '.turbo': 'turbopack build output',
    build: 'build output',
    coverage: 'test coverage output',
    '.cache': 'cache directory',
    '.vercel': 'vercel dotfile',
  };
  return reasons[dirName] ?? `directory excluded by walk policy`;
}

/** Return true when a file could not be classified into any known surface. */
export function isUnknownFile(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  return surface === 'misc';
}
