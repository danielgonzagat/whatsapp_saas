import * as path from 'path';
import { buildArtifactRegistry } from './artifact-registry';
import { pathExists, readDir, readTextFile } from './safe-fs';
import type {
  PulseCodacyHotspot,
  PulseCodacyIssue,
  PulseCodacySeverity,
  PulseCodacySummary,
  PulseConvergenceOwnerLane,
  PulseScopeFile,
  PulseScopeFileKind,
  PulseScopeState,
  PulseScopeSurface,
} from './types';

const SCANNABLE_EXTENSIONS = new Set([
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

const IGNORED_DIRECTORIES = new Set([
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

const ROOT_CONFIG_FILES = new Set([
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

interface GovernanceBoundary {
  protectedExact: Set<string>;
  protectedPrefixes: string[];
}

function normalizePath(input: string): string {
  return input.split(path.sep).join('/').replace(/^\.\//, '');
}

function normalizeSeverity(value: string | undefined | null): PulseCodacySeverity {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return normalized;
  }
  return 'UNKNOWN';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

function createZeroRecord<K extends string>(keys: K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function createSurfaceCountRecord(): Record<PulseScopeSurface, number> {
  return createZeroRecord<PulseScopeSurface>([
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

function createKindCountRecord(): Record<PulseScopeFileKind, number> {
  return createZeroRecord<PulseScopeFileKind>([
    'source',
    'spec',
    'migration',
    'config',
    'document',
    'artifact',
  ]);
}

function loadGovernanceBoundary(rootDir: string): GovernanceBoundary {
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

function isProtectedFile(relPath: string, boundary: GovernanceBoundary): boolean {
  if (boundary.protectedExact.has(relPath)) {
    return true;
  }
  return boundary.protectedPrefixes.some((prefix) => relPath.startsWith(prefix));
}

function shouldIgnoreDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name);
}

function isScannableFile(relPath: string, observedGeneratedArtifactPaths: Set<string>): boolean {
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

function readLineCount(filePath: string): number {
  try {
    return readTextFile(filePath, 'utf8').split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

function classifySurface(relPath: string, protectedByGovernance: boolean): PulseScopeSurface {
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

function classifyKind(relPath: string, surface: PulseScopeSurface): PulseScopeFileKind {
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

function classifyModuleCandidate(relPath: string): string | null {
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

function classifyOwnerLane(
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

function isRuntimeCritical(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
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

function isUserFacing(surface: PulseScopeSurface, kind: PulseScopeFileKind): boolean {
  if (kind === 'artifact' || kind === 'document') {
    return false;
  }
  return surface === 'frontend' || surface === 'frontend-admin';
}

function buildCodacySummary(rootDir: string): PulseCodacySummary {
  const sourcePath = path.join(rootDir, 'PULSE_CODACY_STATE.json');
  if (!pathExists(sourcePath)) {
    return {
      snapshotAvailable: false,
      sourcePath: null,
      syncedAt: null,
      ageMinutes: null,
      stale: true,
      loc: 0,
      totalIssues: 0,
      severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      toolCounts: {},
      topFiles: [],
      highPriorityBatch: [],
      observedFiles: [],
    };
  }

  try {
    const parsed = JSON.parse(readTextFile(sourcePath, 'utf8')) as Record<string, unknown>;
    const syncedAt = typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null;
    const ageMinutes =
      syncedAt && Number.isFinite(Date.parse(syncedAt))
        ? Math.round((Date.now() - Date.parse(syncedAt)) / 60000)
        : null;

    const highPriorityBatch = Array.isArray(parsed.highPriorityBatch)
      ? parsed.highPriorityBatch.map((entry) => {
          const record = entry as Record<string, unknown>;
          return {
            issueId: String(record.issueId || ''),
            filePath: normalizePath(String(record.filePath || '')),
            lineNumber: Number(record.lineNumber || 1),
            patternId: String(record.patternId || ''),
            category: String(record.category || ''),
            severityLevel: normalizeSeverity(String(record.severityLevel || 'UNKNOWN')),
            tool: String(record.tool || ''),
            message: String(record.message || ''),
            commitSha: record.commitSha ? String(record.commitSha) : null,
            commitTimestamp: record.commitTimestamp ? String(record.commitTimestamp) : null,
          } satisfies PulseCodacyIssue;
        })
      : [];

    const highPriorityByFile = new Map<string, PulseCodacyIssue[]>();
    for (const issue of highPriorityBatch) {
      if (!highPriorityByFile.has(issue.filePath)) {
        highPriorityByFile.set(issue.filePath, []);
      }
      highPriorityByFile.get(issue.filePath)!.push(issue);
    }

    const topFiles = Array.isArray(parsed.topFiles)
      ? parsed.topFiles.map((entry) => {
          const record = entry as Record<string, unknown>;
          const filePath = normalizePath(String(record.file || ''));
          const issues = highPriorityByFile.get(filePath) || [];
          return {
            filePath,
            issueCount: Number(record.count || 0),
            highestSeverity:
              issues.find((issue) => issue.severityLevel === 'HIGH')?.severityLevel || 'UNKNOWN',
            categories: uniqueStrings(issues.map((issue) => issue.category)),
            tools: uniqueStrings(issues.map((issue) => issue.tool)),
            highSeverityCount: issues.filter((issue) => issue.severityLevel === 'HIGH').length,
          } satisfies PulseCodacyHotspot;
        })
      : [];

    return {
      snapshotAvailable: true,
      sourcePath,
      syncedAt,
      ageMinutes,
      stale: ageMinutes === null ? true : ageMinutes > 24 * 60,
      loc: Number((parsed.repositorySummary as Record<string, unknown> | undefined)?.loc || 0),
      totalIssues: Number(parsed.totalIssues || 0),
      severityCounts: {
        HIGH: Number((parsed.bySeverity as Record<string, number> | undefined)?.HIGH || 0),
        MEDIUM: Number((parsed.bySeverity as Record<string, number> | undefined)?.MEDIUM || 0),
        LOW: Number((parsed.bySeverity as Record<string, number> | undefined)?.LOW || 0),
        UNKNOWN: Number((parsed.bySeverity as Record<string, number> | undefined)?.UNKNOWN || 0),
      },
      toolCounts: Object.fromEntries(
        Object.entries((parsed.byTool as Record<string, number> | undefined) || {}).map(
          ([tool, count]) => [tool, Number(count || 0)],
        ),
      ),
      topFiles,
      highPriorityBatch,
      observedFiles: uniqueStrings([
        ...topFiles.map((entry) => entry.filePath),
        ...highPriorityBatch.map((entry) => entry.filePath),
      ]),
    };
  } catch {
    return {
      snapshotAvailable: false,
      sourcePath,
      syncedAt: null,
      ageMinutes: null,
      stale: true,
      loc: 0,
      totalIssues: 0,
      severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      toolCounts: {},
      topFiles: [],
      highPriorityBatch: [],
      observedFiles: [],
    };
  }
}

function walkScopeFiles(
  rootDir: string,
  currentDir: string,
  boundary: GovernanceBoundary,
  codacy: PulseCodacySummary,
  observedGeneratedArtifactPaths: Set<string>,
  files: PulseScopeFile[],
) {
  for (const entry of readDir(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory() && shouldIgnoreDirectory(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relPath = normalizePath(path.relative(rootDir, absolutePath));
    if (entry.isDirectory()) {
      walkScopeFiles(
        rootDir,
        absolutePath,
        boundary,
        codacy,
        observedGeneratedArtifactPaths,
        files,
      );
      continue;
    }

    if (!isScannableFile(relPath, observedGeneratedArtifactPaths)) {
      continue;
    }

    const protectedByGovernance = isProtectedFile(relPath, boundary);
    const surface = classifySurface(relPath, protectedByGovernance);
    const kind = classifyKind(relPath, surface);
    const moduleCandidate = classifyModuleCandidate(relPath);
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
      executionMode: protectedByGovernance ? 'human_required' : 'ai_safe',
      protectedByGovernance,
      codacyTracked: true,
      moduleCandidate,
      observedCodacyIssueCount: topFile?.issueCount || 0,
      highSeverityIssueCount: highIssues.filter((issue) => issue.severityLevel === 'HIGH').length,
      highestObservedSeverity,
    });
  }
}

/** Build scope state. */
export function buildScopeState(rootDir: string): PulseScopeState {
  const codacy = buildCodacySummary(rootDir);
  const boundary = loadGovernanceBoundary(rootDir);
  const artifactRegistry = buildArtifactRegistry(rootDir);
  const mirroredArtifacts = new Set(artifactRegistry.mirrors.map(normalizePath));
  const observedGeneratedArtifactPaths = new Set(
    codacy.observedFiles.filter((filePath) => mirroredArtifacts.has(filePath)),
  );
  const files: PulseScopeFile[] = [];
  walkScopeFiles(rootDir, rootDir, boundary, codacy, observedGeneratedArtifactPaths, files);

  const fileMap = new Map(files.map((entry) => [entry.path, entry] as const));
  const surfaceCounts = createSurfaceCountRecord();
  const kindCounts = createKindCountRecord();

  let totalLines = 0;
  let runtimeCriticalFiles = 0;
  let userFacingFiles = 0;
  let humanRequiredFiles = 0;

  for (const file of files) {
    surfaceCounts[file.surface] += 1;
    kindCounts[file.kind] += 1;
    totalLines += file.lineCount;
    if (file.runtimeCritical) {
      runtimeCriticalFiles += 1;
    }
    if (file.userFacing) {
      userFacingFiles += 1;
    }
    if (file.executionMode === 'human_required') {
      humanRequiredFiles += 1;
    }
  }

  const moduleAggregateMap = new Map<
    string,
    {
      moduleKey: string;
      fileCount: number;
      runtimeCriticalFileCount: number;
      userFacingFileCount: number;
      humanRequiredFileCount: number;
      observedCodacyIssueCount: number;
      highSeverityIssueCount: number;
      surfaces: Set<PulseScopeSurface>;
    }
  >();

  for (const file of files) {
    if (!file.moduleCandidate) {
      continue;
    }
    if (!moduleAggregateMap.has(file.moduleCandidate)) {
      moduleAggregateMap.set(file.moduleCandidate, {
        moduleKey: file.moduleCandidate,
        fileCount: 0,
        runtimeCriticalFileCount: 0,
        userFacingFileCount: 0,
        humanRequiredFileCount: 0,
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        surfaces: new Set<PulseScopeSurface>(),
      });
    }

    const aggregate = moduleAggregateMap.get(file.moduleCandidate)!;
    aggregate.fileCount += 1;
    aggregate.runtimeCriticalFileCount += file.runtimeCritical ? 1 : 0;
    aggregate.userFacingFileCount += file.userFacing ? 1 : 0;
    aggregate.humanRequiredFileCount += file.executionMode === 'human_required' ? 1 : 0;
    aggregate.observedCodacyIssueCount += file.observedCodacyIssueCount;
    aggregate.highSeverityIssueCount += file.highSeverityIssueCount;
    aggregate.surfaces.add(file.surface);
  }

  const moduleAggregates = [...moduleAggregateMap.values()]
    .map((aggregate) => ({
      moduleKey: aggregate.moduleKey,
      fileCount: aggregate.fileCount,
      runtimeCriticalFileCount: aggregate.runtimeCriticalFileCount,
      userFacingFileCount: aggregate.userFacingFileCount,
      humanRequiredFileCount: aggregate.humanRequiredFileCount,
      observedCodacyIssueCount: aggregate.observedCodacyIssueCount,
      highSeverityIssueCount: aggregate.highSeverityIssueCount,
      surfaces: [...aggregate.surfaces].sort(),
    }))
    .sort((left, right) => left.moduleKey.localeCompare(right.moduleKey));

  const missingCodacyFiles = codacy.observedFiles.filter((filePath) => !fileMap.has(filePath));
  const parityConfidence = !codacy.snapshotAvailable
    ? 'low'
    : missingCodacyFiles.length > 0
      ? 'low'
      : codacy.stale
        ? 'medium'
        : 'high';

  const summaryReason =
    missingCodacyFiles.length > 0
      ? `Observed Codacy files are missing from repo inventory: ${missingCodacyFiles.join(', ')}.`
      : !codacy.snapshotAvailable
        ? 'Repo inventory completed, but Codacy snapshot is unavailable for cross-check.'
        : codacy.stale
          ? 'Repo inventory completed and observed Codacy files are covered, but the Codacy snapshot is stale.'
          : 'Repo inventory completed and all observed Codacy hotspot files are covered.';

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    summary: {
      totalFiles: files.length,
      totalLines,
      runtimeCriticalFiles,
      userFacingFiles,
      humanRequiredFiles,
      surfaceCounts,
      kindCounts,
      unmappedModuleCandidates: moduleAggregates
        .filter((aggregate) => aggregate.fileCount < 2)
        .map((aggregate) => aggregate.moduleKey)
        .sort(),
    },
    parity: {
      status: missingCodacyFiles.length === 0 ? 'pass' : 'fail',
      mode: 'repo_inventory_with_codacy_spotcheck',
      confidence: parityConfidence,
      reason: summaryReason,
      inventoryFiles: files.length,
      codacyObservedFiles: codacy.observedFiles.length,
      codacyObservedFilesCovered: codacy.observedFiles.length - missingCodacyFiles.length,
      missingCodacyFiles,
    },
    codacy,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    moduleAggregates,
  };
}
