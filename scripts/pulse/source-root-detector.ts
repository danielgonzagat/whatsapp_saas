import * as path from 'path';
import { pathExists, readDir, readJsonFile, readTextFile } from './safe-fs';
import { safeJoin } from './safe-path';

type PackageJson = {
  name?: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: unknown;
  imports?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
};

type TsConfigJson = {
  files?: string[];
  include?: string[];
  compilerOptions?: {
    baseUrl?: string;
    rootDir?: string;
    paths?: Record<string, string[]>;
  };
};

export type SourceRootKind = 'backend' | 'frontend' | 'worker' | 'script' | 'library' | 'unknown';
export type SourceRootAvailability = 'inferred' | 'not_available';
export type SourceRootEvidenceBasis =
  | 'package-manifest'
  | 'package-export'
  | 'tsconfig'
  | 'jsconfig'
  | 'build-config'
  | 'import-graph'
  | 'file-evidence'
  | 'weak-fallback';

export interface DetectedSourceRoot {
  relativePath: string;
  absolutePath: string;
  kind: SourceRootKind;
  packageName: string | null;
  evidence: string[];
  evidenceBasis: SourceRootEvidenceBasis[];
  availability: SourceRootAvailability;
  unavailableReason: string | null;
  weakCandidate: boolean;
  languageExtensions: string[];
}

const SOURCE_DIR_NAMES = new Set(['src', 'app', 'pages', 'lib']);
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const BUILD_CONFIG_FILES = new Set([
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'rollup.config.js',
  'rollup.config.mjs',
  'rollup.config.ts',
  'tsup.config.ts',
  'nest-cli.json',
]);
const WEAK_FALLBACK_SEGMENTS: Array<{
  base: string;
  sourceDir: string;
  packageName: string | null;
}> = [
  { base: 'backend', sourceDir: 'src', packageName: null },
  { base: 'frontend', sourceDir: 'src', packageName: null },
  { base: 'worker', sourceDir: 'src', packageName: null },
];
const SKIP_DIR_NAMES = new Set([
  '.claude',
  '.git',
  '.next',
  '__tests__',
  'coverage',
  'dist',
  'node_modules',
  'test',
  'tests',
  'tmp',
  'temp',
]);

function normalizeRelative(input: string): string {
  return input.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function inferKind(relativePath: string, packageName: string | null): SourceRootKind {
  if (relativePath.startsWith('scripts/')) {
    return 'script';
  }
  if (packageName) {
    return 'library';
  }
  return 'unknown';
}

function packageDependencyNames(pkg: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
}

function inferKindFromPackage(
  pkg: PackageJson,
  rootDir: string,
  relativeDir: string,
): SourceRootKind {
  const deps = packageDependencyNames(pkg);
  const scripts = Object.values(pkg.scripts ?? {})
    .join('\n')
    .toLowerCase();
  const packageDir = safeJoin(rootDir, relativeDir || '.');

  if (
    deps.has('next') ||
    deps.has('react') ||
    deps.has('vite') ||
    deps.has('@vitejs/plugin-react') ||
    pathExists(safeJoin(packageDir, 'next.config.js')) ||
    pathExists(safeJoin(packageDir, 'next.config.mjs')) ||
    pathExists(safeJoin(packageDir, 'next.config.ts')) ||
    pathExists(safeJoin(packageDir, 'vite.config.ts'))
  ) {
    return 'frontend';
  }

  if (
    deps.has('bullmq') ||
    deps.has('@nestjs/bull') ||
    deps.has('@nestjs/bullmq') ||
    /\b(queue|worker|processor)\b/.test(scripts)
  ) {
    return 'worker';
  }

  if (
    deps.has('@nestjs/core') ||
    deps.has('@nestjs/common') ||
    pathExists(safeJoin(packageDir, 'nest-cli.json')) ||
    /\bnest\b/.test(scripts)
  ) {
    return 'backend';
  }

  return inferKind(relativeDir, pkg.name ?? null);
}

function inferKindFromFileEvidence(rootDir: string, relativeDir: string): SourceRootKind {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return inferKind(relativeDir, null);

  let frontendSignals = 0;
  let backendSignals = 0;
  let workerSignals = 0;

  for (const entry of readDir(absoluteDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) continue;
    const ext = path.extname(normalized);
    if (!SOURCE_EXTENSIONS.includes(ext)) continue;

    const absoluteFile = safeJoin(absoluteDir, normalized);
    let content = '';
    try {
      content = readTextFile(absoluteFile, 'utf8');
    } catch {
      content = '';
    }

    if (
      /from\s+['"](?:next|react|@vitejs\/plugin-react)/.test(content) ||
      /['"]use client['"]/.test(content) ||
      /export\s+default\s+function/.test(content) ||
      /(?:^|\/)(app|pages)\//.test(normalized)
    ) {
      frontendSignals++;
    }
    if (
      /from\s+['"]@nestjs\/common['"]/.test(content) ||
      /@Controller\(/.test(content) ||
      /@Injectable\(/.test(content) ||
      /setGlobalPrefix\s*\(/.test(content)
    ) {
      backendSignals++;
    }
    if (
      /from\s+['"](?:bullmq|@nestjs\/bullmq|@nestjs\/bull)['"]/.test(content) ||
      /@Processor\(/.test(content) ||
      /\bnew\s+Worker\(/.test(content)
    ) {
      workerSignals++;
    }
  }

  const scores: Array<{ kind: SourceRootKind; score: number }> = [];
  scores.push({ kind: 'frontend', score: frontendSignals });
  scores.push({ kind: 'backend', score: backendSignals });
  scores.push({ kind: 'worker', score: workerSignals });
  scores.sort((a, b) => b.score - a.score);
  const strongestSignal = scores[0];

  return strongestSignal && strongestSignal.score > 0
    ? strongestSignal.kind
    : inferKind(relativeDir, null);
}

function hasSkippedSegment(relativePath: string): boolean {
  return normalizeRelative(relativePath)
    .split('/')
    .some((part) => SKIP_DIR_NAMES.has(part));
}

function readJsonOrNull<T>(filePath: string): T | null {
  try {
    if (!pathExists(filePath)) return null;
    return readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

function workspacePatterns(pkg: PackageJson | null): string[] {
  if (!pkg?.workspaces) return [];
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
  return pkg.workspaces.packages ?? [];
}

function packageDirsFromWorkspaces(rootDir: string, patterns: string[]): string[] {
  const dirs = new Set<string>();

  for (const pattern of patterns) {
    const normalized = normalizeRelative(pattern);
    if (!normalized || normalized.includes('..')) continue;

    if (!normalized.includes('*')) {
      const packageJson = safeJoin(rootDir, normalized, 'package.json');
      if (pathExists(packageJson)) dirs.add(normalized);
      continue;
    }

    const wildcardIndex = normalized.indexOf('*');
    const base = normalizeRelative(normalized.slice(0, wildcardIndex));
    const baseDir = safeJoin(rootDir, base || '.');
    if (!pathExists(baseDir)) continue;

    for (const entry of readDir(baseDir)) {
      const candidate = normalizeRelative(safeJoin(base, entry));
      if (pathExists(safeJoin(rootDir, candidate, 'package.json'))) {
        dirs.add(candidate);
      }
    }
  }

  return [...dirs];
}

function discoverPackageDirs(rootDir: string): Map<string, PackageJson> {
  const packages = new Map<string, PackageJson>();
  const rootPackage = readJsonOrNull<PackageJson>(safeJoin(rootDir, 'package.json'));
  if (rootPackage) {
    packages.set('', rootPackage);
  }

  const workspaceDirs = packageDirsFromWorkspaces(rootDir, workspacePatterns(rootPackage));
  for (const relativeDir of workspaceDirs) {
    const pkg = readJsonOrNull<PackageJson>(safeJoin(rootDir, relativeDir, 'package.json'));
    if (pkg) {
      packages.set(relativeDir, pkg);
    }
  }

  for (const entry of readDir(rootDir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const candidate = safeJoin(rootDir, entry, 'package.json');
    const pkg = readJsonOrNull<PackageJson>(candidate);
    if (pkg) {
      packages.set(normalizeRelative(entry), pkg);
    }
  }

  return packages;
}

function staticPrefixFromPattern(pattern: string): string | null {
  const normalized = normalizeRelative(pattern);
  if (!normalized || normalized.includes('..')) return null;
  const segments = normalized.split('/');
  const staticSegments: string[] = [];

  for (const segment of segments) {
    if (segment.includes('*') || segment.includes('{') || segment.includes('[')) break;
    staticSegments.push(segment);
  }

  if (staticSegments.length === 0) return null;
  const last = staticSegments[staticSegments.length - 1];
  if (last && path.extname(last)) {
    staticSegments.pop();
  }
  if (staticSegments.length === 0) return null;
  return staticSegments.join('/');
}

function sourceRootFromPatternEntry(relativeDir: string, entry: string): string | null {
  const prefix = staticPrefixFromPattern(entry);
  if (!prefix) return null;
  const sourceRoot = normalizeRelative(safeJoin(relativeDir, prefix));
  if (hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

function sourceRootFromPathEntry(relativeDir: string, entry: string): string | null {
  const normalizedEntry = normalizeRelative(entry.replace(/^\.\//, ''));
  if (!normalizedEntry || normalizedEntry.includes('..')) return null;
  const segments = normalizedEntry.split('/');
  const sourceIndex = segments.findIndex((segment) => SOURCE_DIR_NAMES.has(segment));
  if (sourceIndex < 0) return null;
  const sourceRoot = normalizeRelative(
    safeJoin(relativeDir, segments.slice(0, sourceIndex + 1).join('/')),
  );
  if (hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

function hasSourceFiles(rootDir: string, relativeDir: string): boolean {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return false;

  const entries = readDir(absoluteDir, { recursive: true }) as string[];
  return entries.some((entry) => {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) return false;
    return SOURCE_EXTENSIONS.includes(path.extname(normalized));
  });
}

function languageExtensionsFor(rootDir: string, relativeDir: string): string[] {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return [];

  const found = new Set<string>();
  for (const entry of readDir(absoluteDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) continue;
    const ext = path.extname(normalized);
    if (SOURCE_EXTENSIONS.includes(ext)) found.add(ext);
  }
  return [...found].sort();
}

function addRoot(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  relativePath: string,
  packageName: string | null,
  evidence: string,
  evidenceBasis: SourceRootEvidenceBasis,
  options: { weakCandidate?: boolean; kind?: SourceRootKind } = {},
): void {
  const normalized = normalizeRelative(relativePath);
  if (hasSkippedSegment(normalized)) return;
  const weakCandidate = options.weakCandidate === true;
  const hasFiles = hasSourceFiles(rootDir, normalized);
  if (!normalized || (!weakCandidate && !hasFiles)) return;
  const languageExtensions = languageExtensionsFor(rootDir, normalized);
  const availability: SourceRootAvailability =
    languageExtensions.length > 0 ? 'inferred' : 'not_available';
  const unavailableReason =
    availability === 'not_available'
      ? 'source root exists but no scannable source files were found'
      : null;
  const kind = options.kind ?? inferKind(normalized, packageName);

  const existing = roots.get(normalized);
  if (existing) {
    if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    if (!existing.evidenceBasis.includes(evidenceBasis)) existing.evidenceBasis.push(evidenceBasis);
    if (existing.kind === 'unknown' || existing.kind === 'library') {
      existing.kind = kind;
    }
    if (existing.availability === 'not_available' && availability === 'inferred') {
      existing.availability = 'inferred';
      existing.unavailableReason = null;
    }
    existing.weakCandidate = existing.weakCandidate && weakCandidate;
    return;
  }

  roots.set(normalized, {
    relativePath: normalized,
    absolutePath: path.resolve(rootDir, normalized),
    kind,
    packageName,
    evidence: [evidence],
    evidenceBasis: [evidenceBasis],
    availability,
    unavailableReason,
    weakCandidate,
    languageExtensions,
  });
}

function discoverProjectConfigs(rootDir: string): string[] {
  const configs: string[] = [];
  for (const entry of readDir(rootDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) continue;
    if (/^[tj]sconfig(?:\.[\w-]+)?\.json$/.test(path.basename(normalized))) {
      configs.push(normalized);
    }
  }
  return configs;
}

function packageManifestEntries(pkg: PackageJson): string[] {
  const entries: string[] = [];
  for (const value of [pkg.main, pkg.module, pkg.types]) {
    if (typeof value === 'string') entries.push(value);
  }
  entries.push(...Object.values(pkg.scripts ?? {}));
  entries.push(...stringValues(pkg.exports));
  entries.push(...stringValues(pkg.imports));
  return entries;
}

function entryMentionsSourceFile(entry: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) => entry.includes(extension));
}

function stringValues(input: unknown): string[] {
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) return input.flatMap((value) => stringValues(value));
  if (input && typeof input === 'object') {
    return Object.values(input).flatMap((value) => stringValues(value));
  }
  return [];
}

function addPackageRoots(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  packages: Map<string, PackageJson>,
): void {
  for (const [relativeDir, pkg] of packages) {
    const base = relativeDir || '.';
    const packageKind = inferKindFromPackage(pkg, rootDir, relativeDir);
    for (const dirName of SOURCE_DIR_NAMES) {
      addRoot(
        roots,
        rootDir,
        normalizeRelative(safeJoin(base, dirName)),
        pkg.name ?? null,
        `package:${relativeDir || '.'}`,
        'package-manifest',
        { kind: packageKind },
      );
    }

    for (const entry of packageManifestEntries(pkg)) {
      const root = sourceRootFromPathEntry(relativeDir || '.', entry);
      if (root) {
        addRoot(
          roots,
          rootDir,
          root,
          pkg.name ?? null,
          `package-export:${relativeDir || '.'}`,
          'package-export',
          { kind: packageKind },
        );
      } else if (relativeDir && entryMentionsSourceFile(entry)) {
        addRoot(
          roots,
          rootDir,
          relativeDir,
          pkg.name ?? null,
          `package-manifest:${relativeDir}`,
          'package-manifest',
          { kind: packageKind },
        );
      }
    }
  }
}

function addTsConfigRoots(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  packages: Map<string, PackageJson>,
): void {
  const packageByDir = new Map<string, string | null>();
  for (const [relativeDir, pkg] of packages) {
    packageByDir.set(relativeDir, pkg.name ?? null);
  }
  const kindByDir = new Map(
    [...packages.entries()].map(([relativeDir, pkg]) => [
      relativeDir,
      inferKindFromPackage(pkg, rootDir, relativeDir),
    ]),
  );

  for (const configPath of discoverProjectConfigs(rootDir)) {
    const config = readJsonOrNull<TsConfigJson>(safeJoin(rootDir, configPath));
    if (!config) continue;
    const configDir = normalizeRelative(path.dirname(configPath));
    const packageName = packageByDir.get(configDir === '.' ? '' : configDir) ?? null;
    const basis: SourceRootEvidenceBasis = path.basename(configPath).startsWith('jsconfig')
      ? 'jsconfig'
      : 'tsconfig';
    const entries = [
      ...(config.files ?? []),
      ...(config.include ?? []),
      ...(config.compilerOptions?.rootDir ? [config.compilerOptions.rootDir] : []),
      ...(config.compilerOptions?.baseUrl ? [config.compilerOptions.baseUrl] : []),
      ...Object.values(config.compilerOptions?.paths ?? {}).flat(),
    ];

    for (const entry of entries) {
      const root =
        sourceRootFromPatternEntry(configDir === '.' ? '.' : configDir, entry) ??
        sourceRootFromPathEntry(configDir === '.' ? '.' : configDir, entry);
      if (root) {
        addRoot(roots, rootDir, root, packageName, `${basis}:${configPath}`, basis, {
          kind: kindByDir.get(configDir === '.' ? '' : configDir),
        });
      }
    }
  }
}

function discoverBuildConfigRoots(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  packages: Map<string, PackageJson>,
): void {
  for (const [relativeDir, pkg] of packages) {
    const packageDir = relativeDir || '.';
    const packageKind = inferKindFromPackage(pkg, rootDir, relativeDir);
    for (const fileName of BUILD_CONFIG_FILES) {
      const configPath = safeJoin(rootDir, packageDir, fileName);
      if (!pathExists(configPath)) continue;

      if (fileName === 'nest-cli.json') {
        const nestConfig = readJsonOrNull<{ sourceRoot?: string }>(configPath);
        if (typeof nestConfig?.sourceRoot === 'string') {
          const sourceRoot =
            sourceRootFromPatternEntry(packageDir, nestConfig.sourceRoot) ??
            sourceRootFromPathEntry(packageDir, nestConfig.sourceRoot);
          if (sourceRoot) {
            addRoot(
              roots,
              rootDir,
              sourceRoot,
              pkg.name ?? null,
              `build-config:${normalizeRelative(safeJoin(packageDir, fileName))}`,
              'build-config',
              { kind: packageKind },
            );
          }
        }
      }

      for (const dirName of SOURCE_DIR_NAMES) {
        addRoot(
          roots,
          rootDir,
          normalizeRelative(safeJoin(packageDir, dirName)),
          pkg.name ?? null,
          `build-config:${normalizeRelative(safeJoin(packageDir, fileName))}`,
          'build-config',
          { kind: packageKind },
        );
      }
    }
  }
}

function addFileEvidenceRoots(roots: Map<string, DetectedSourceRoot>, rootDir: string): void {
  const candidates = new Set<string>();
  for (const entry of readDir(rootDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    const segments = normalized.split('/');
    if (segments.some((part) => SKIP_DIR_NAMES.has(part))) continue;
    if (!SOURCE_EXTENSIONS.includes(path.extname(normalized))) continue;

    const sourceIndex = segments.findIndex((segment) => SOURCE_DIR_NAMES.has(segment));
    if (sourceIndex >= 0) {
      candidates.add(segments.slice(0, sourceIndex + 1).join('/'));
    }
  }

  for (const relativePath of candidates) {
    const kind = inferKindFromFileEvidence(rootDir, relativePath);
    const basis: SourceRootEvidenceBasis = kind === 'unknown' ? 'file-evidence' : 'import-graph';
    addRoot(roots, rootDir, relativePath, null, `${basis}:source-files`, basis, { kind });
  }
}

function addWeakFallbackRoots(roots: Map<string, DetectedSourceRoot>, rootDir: string): void {
  if (roots.size > 0) return;

  for (const fallback of WEAK_FALLBACK_SEGMENTS) {
    const relativePath = normalizeRelative(safeJoin(fallback.base, fallback.sourceDir));
    if (!pathExists(safeJoin(rootDir, relativePath))) continue;
    addRoot(
      roots,
      rootDir,
      relativePath,
      fallback.packageName,
      'weak-fallback:conventional-source-root-exists-without-manifest-evidence',
      'weak-fallback',
      { weakCandidate: true },
    );
  }
}

export function detectSourceRoots(rootDir: string): DetectedSourceRoot[] {
  const absoluteRoot = path.resolve(rootDir);
  const roots = new Map<string, DetectedSourceRoot>();
  const packages = discoverPackageDirs(absoluteRoot);

  addPackageRoots(roots, absoluteRoot, packages);
  addTsConfigRoots(roots, absoluteRoot, packages);
  discoverBuildConfigRoots(roots, absoluteRoot, packages);
  addFileEvidenceRoots(roots, absoluteRoot);
  addWeakFallbackRoots(roots, absoluteRoot);

  return [...roots.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function sourceGlobsForTsMorph(rootDir: string): string[] {
  const globs: string[] = [];
  for (const root of detectSourceRoots(rootDir)) {
    for (const ext of root.languageExtensions) {
      globs.push(`${root.absolutePath.split(path.sep).join('/')}/**/*${ext}`);
    }
  }
  return globs;
}
