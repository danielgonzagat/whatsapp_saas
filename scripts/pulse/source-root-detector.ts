import * as path from 'path';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverDirectorySkipHintsFromEvidence,
  discoverSourceExtensionsFromObservedTypescript,
} from './dynamic-reality-kernel';
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
export type SourceRootLanguage = 'javascript' | 'typescript';
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
  languages: SourceRootLanguage[];
  frameworks: string[];
  entrypoints: string[];
}

const CONVENTIONAL_SOURCE_DIR_NAMES = new Set(['src', 'app', 'pages', 'lib']);
const sourceExtensionsSet = discoverSourceExtensionsFromObservedTypescript();

const ZERO = deriveZeroValue();
const ONE = deriveUnitValue();

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
  ...discoverDirectorySkipHintsFromEvidence(),
  '.claude',
  '.git',
  '__tests__',
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > ZERO))].sort();
}

function languageForExtension(extension: string): SourceRootLanguage | null {
  if (extension === '.ts' || extension === '.tsx') return 'typescript';
  if (extension === '.js' || extension === '.jsx') return 'javascript';
  return null;
}

function languagesForExtensions(extensions: string[]): SourceRootLanguage[] {
  return uniqueSorted(
    extensions.flatMap((extension) => {
      const language = languageForExtension(extension);
      return language ? [language] : [];
    }),
  ) as SourceRootLanguage[];
}

function inferFrameworksFromPackage(
  pkg: PackageJson,
  rootDir: string,
  relativeDir: string,
): string[] {
  const deps = packageDependencyNames(pkg);
  const scripts = Object.values(pkg.scripts ?? {})
    .join('\n')
    .toLowerCase();
  const packageDir = safeJoin(rootDir, relativeDir || '.');
  const frameworks: string[] = [];

  if (
    deps.has('next') ||
    pathExists(safeJoin(packageDir, 'next.config.js')) ||
    pathExists(safeJoin(packageDir, 'next.config.mjs')) ||
    pathExists(safeJoin(packageDir, 'next.config.ts'))
  ) {
    frameworks.push('nextjs');
  }
  if (deps.has('react') || deps.has('@types/react')) frameworks.push('react');
  if (
    deps.has('vite') ||
    deps.has('@vitejs/plugin-react') ||
    pathExists(safeJoin(packageDir, 'vite.config.ts'))
  ) {
    frameworks.push('vite');
  }
  if (
    deps.has('@nestjs/core') ||
    deps.has('@nestjs/common') ||
    pathExists(safeJoin(packageDir, 'nest-cli.json')) ||
    /\bnest\b/.test(scripts)
  ) {
    frameworks.push('nestjs');
  }
  if (
    deps.has('bullmq') ||
    deps.has('@nestjs/bull') ||
    deps.has('@nestjs/bullmq') ||
    /\b(queue|worker|processor)\b/.test(scripts)
  ) {
    frameworks.push('bullmq');
  }

  return uniqueSorted(frameworks);
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

  let frontendSignals = ZERO;
  let backendSignals = ZERO;
  let workerSignals = ZERO;

  for (const entry of readDir(absoluteDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) continue;
    const ext = path.extname(normalized);
    if (!sourceExtensionsSet.has(ext)) continue;

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
  const strongestSignal = scores[ZERO];

  return strongestSignal && strongestSignal.score > ZERO
    ? strongestSignal.kind
    : inferKind(relativeDir, null);
}

function inferFrameworksFromFileEvidence(rootDir: string, relativeDir: string): string[] {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return [];

  const frameworks: string[] = [];
  for (const entry of readDir(absoluteDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) continue;
    const ext = path.extname(normalized);
    if (!sourceExtensionsSet.has(ext)) continue;

    let content = '';
    try {
      content = readTextFile(safeJoin(absoluteDir, normalized), 'utf8');
    } catch {
      content = '';
    }

    if (/from\s+['"]next(?:\/[^'"]*)?['"]/.test(content) || /(?:^|\/)app\//.test(normalized)) {
      frameworks.push('nextjs');
    }
    if (/from\s+['"]react(?:\/[^'"]*)?['"]/.test(content) || /['"]use client['"]/.test(content)) {
      frameworks.push('react');
    }
    if (
      /from\s+['"]@nestjs\/common['"]/.test(content) ||
      /@(?:Controller|Injectable|Module)\(/.test(content)
    ) {
      frameworks.push('nestjs');
    }
    if (
      /from\s+['"](?:bullmq|@nestjs\/bullmq|@nestjs\/bull)['"]/.test(content) ||
      /@Processor\(/.test(content)
    ) {
      frameworks.push('bullmq');
    }
  }

  return uniqueSorted(frameworks);
}

function hasFrameworkFileSignal(content: string, relativeFile: string): boolean {
  return (
    /from\s+['"]next(?:\/[^'"]*)?['"]/.test(content) ||
    /from\s+['"]react(?:\/[^'"]*)?['"]/.test(content) ||
    /from\s+['"]@nestjs\/common['"]/.test(content) ||
    /from\s+['"](?:bullmq|@nestjs\/bullmq|@nestjs\/bull)['"]/.test(content) ||
    /@(?:Controller|Injectable|Module|Processor)\(/.test(content) ||
    /['"]use client['"]/.test(content) ||
    /(?:^|\/)app\//.test(relativeFile)
  );
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
    const base = normalizeRelative(normalized.slice(ZERO, wildcardIndex));
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

  if (staticSegments.length === ZERO) return null;
  const last = staticSegments[staticSegments.length - ONE];
  if (last && path.extname(last)) {
    staticSegments.pop();
  }
  if (staticSegments.length === ZERO) return null;
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
  const sourceIndex = segments.findIndex((segment) => CONVENTIONAL_SOURCE_DIR_NAMES.has(segment));
  if (sourceIndex < ZERO) return null;
  const sourceRoot = normalizeRelative(
    safeJoin(relativeDir, segments.slice(ZERO, sourceIndex + ONE).join('/')),
  );
  if (hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

function sourceRootFromEntrypoint(relativeDir: string, entrypoint: string): string | null {
  const normalizedEntrypoint = normalizeRelative(entrypoint.replace(/^\.\//, ''));
  if (!normalizedEntrypoint || normalizedEntrypoint.includes('..')) return null;
  if (!sourceExtensionsSet.has(path.extname(normalizedEntrypoint))) return null;
  const entryDir = path.dirname(normalizedEntrypoint);
  const packageDir = relativeDir || '.';
  const sourceRoot = normalizeRelative(safeJoin(packageDir, entryDir === '.' ? '.' : entryDir));
  if (!sourceRoot || hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

function sourceEntrypointsFromText(entry: string): string[] {
  const entrypoints: string[] = [];
  const sourceFilePattern =
    /(?:^|[\s"'`=:,(])((?:\.{1,2}\/)?[^\s"'`),;]+?\.(?:tsx?|jsx?))(?:$|[\s"'`),;:])/g;
  for (const match of entry.matchAll(sourceFilePattern)) {
    const candidate = normalizeRelative(match[1].replace(/^\.\//, ''));
    if (!candidate.includes('..') && sourceExtensionsSet.has(path.extname(candidate))) {
      entrypoints.push(candidate);
    }
  }
  return uniqueSorted(entrypoints);
}

function discoverPackageEntrypoints(pkg: PackageJson): string[] {
  return uniqueSorted(
    packageManifestEntries(pkg).flatMap((entry) => sourceEntrypointsFromText(entry)),
  );
}

function hasSourceFiles(rootDir: string, relativeDir: string): boolean {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return false;

  const entries = readDir(absoluteDir, { recursive: true }) as string[];
  return entries.some((entry) => {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) return false;
    return sourceExtensionsSet.has(path.extname(normalized));
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
    if (sourceExtensionsSet.has(ext)) found.add(ext);
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
  options: {
    weakCandidate?: boolean;
    kind?: SourceRootKind;
    frameworks?: string[];
    entrypoints?: string[];
  } = {},
): void {
  const normalized = normalizeRelative(relativePath);
  if (hasSkippedSegment(normalized)) return;
  const weakCandidate = options.weakCandidate === true;
  const hasFiles = hasSourceFiles(rootDir, normalized);
  if (!normalized || (!weakCandidate && !hasFiles)) return;
  const languageExtensions = languageExtensionsFor(rootDir, normalized);
  const availability: SourceRootAvailability =
    languageExtensions.length > ZERO ? 'inferred' : 'not_available';
  const unavailableReason =
    availability === 'not_available'
      ? 'source root exists but no scannable source files were found'
      : null;
  const kind = options.kind ?? inferKind(normalized, packageName);
  const fileEvidenceKind = inferKindFromFileEvidence(rootDir, normalized);
  const resolvedKind = kind === 'unknown' || kind === 'library' ? fileEvidenceKind : kind;
  const evidenceBasisList: SourceRootEvidenceBasis[] =
    fileEvidenceKind === 'unknown' ? [evidenceBasis] : [evidenceBasis, 'import-graph'];
  const frameworks = uniqueSorted([
    ...(options.frameworks ?? []),
    ...inferFrameworksFromFileEvidence(rootDir, normalized),
  ]);
  const entrypoints = uniqueSorted(
    (options.entrypoints ?? []).map((entrypoint) => normalizeRelative(entrypoint)),
  );
  const languages = languagesForExtensions(languageExtensions);

  const existing = roots.get(normalized);
  if (existing) {
    if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    for (const basis of evidenceBasisList) {
      if (!existing.evidenceBasis.includes(basis)) existing.evidenceBasis.push(basis);
    }
    if (existing.kind === 'unknown' || existing.kind === 'library') {
      existing.kind = resolvedKind;
    }
    if (existing.availability === 'not_available' && availability === 'inferred') {
      existing.availability = 'inferred';
      existing.unavailableReason = null;
    }
    existing.languageExtensions = uniqueSorted([
      ...existing.languageExtensions,
      ...languageExtensions,
    ]);
    existing.languages = languagesForExtensions(existing.languageExtensions);
    existing.frameworks = uniqueSorted([...existing.frameworks, ...frameworks]);
    existing.entrypoints = uniqueSorted([...existing.entrypoints, ...entrypoints]);
    existing.weakCandidate = existing.weakCandidate && weakCandidate;
    return;
  }

  roots.set(normalized, {
    relativePath: normalized,
    absolutePath: path.resolve(rootDir, normalized),
    kind: resolvedKind,
    packageName,
    evidence: [evidence],
    evidenceBasis: evidenceBasisList,
    availability,
    unavailableReason,
    weakCandidate,
    languageExtensions,
    languages,
    frameworks,
    entrypoints,
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
  return [...sourceExtensionsSet].some((extension) => entry.includes(extension));
}

function stringValues(input: unknown): string[] {
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) return input.flatMap((value) => stringValues(value));
  if (input && typeof input === 'object') {
    return Object.values(input).flatMap((value) => stringValues(value));
  }
  return [];
}

function discoverConventionalPackageSourceRoots(rootDir: string, relativeDir: string): string[] {
  const base = relativeDir || '.';
  return [...CONVENTIONAL_SOURCE_DIR_NAMES]
    .map((dirName) => normalizeRelative(safeJoin(base, dirName)))
    .filter((candidate) => pathExists(safeJoin(rootDir, candidate)));
}

function addPackageRoots(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  packages: Map<string, PackageJson>,
): void {
  for (const [relativeDir, pkg] of packages) {
    const packageKind = inferKindFromPackage(pkg, rootDir, relativeDir);
    const packageFrameworks = inferFrameworksFromPackage(pkg, rootDir, relativeDir);
    const entrypoints = discoverPackageEntrypoints(pkg);

    for (const entrypoint of entrypoints) {
      const root = sourceRootFromEntrypoint(relativeDir || '.', entrypoint);
      if (root) {
        addRoot(
          roots,
          rootDir,
          root,
          pkg.name ?? null,
          `package-entrypoint:${relativeDir || '.'}:${entrypoint}`,
          'package-manifest',
          {
            kind: packageKind,
            frameworks: packageFrameworks,
            entrypoints: [normalizeRelative(safeJoin(relativeDir || '.', entrypoint))],
          },
        );
      }
    }

    for (const relativeSourceRoot of discoverConventionalPackageSourceRoots(rootDir, relativeDir)) {
      addRoot(
        roots,
        rootDir,
        relativeSourceRoot,
        pkg.name ?? null,
        `package:${relativeDir || '.'}`,
        'package-manifest',
        { kind: packageKind, frameworks: packageFrameworks },
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
          { kind: packageKind, frameworks: packageFrameworks },
        );
      } else if (relativeDir && entryMentionsSourceFile(entry)) {
        addRoot(
          roots,
          rootDir,
          relativeDir,
          pkg.name ?? null,
          `package-manifest:${relativeDir}`,
          'package-manifest',
          { kind: packageKind, frameworks: packageFrameworks },
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
  const frameworksByDir = new Map(
    [...packages.entries()].map(([relativeDir, pkg]) => [
      relativeDir,
      inferFrameworksFromPackage(pkg, rootDir, relativeDir),
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
        const packageDir = configDir === '.' ? '' : configDir;
        addRoot(roots, rootDir, root, packageName, `${basis}:${configPath}`, basis, {
          kind: kindByDir.get(packageDir),
          frameworks: frameworksByDir.get(packageDir),
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
    const packageFrameworks = inferFrameworksFromPackage(pkg, rootDir, relativeDir);
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
              { kind: packageKind, frameworks: packageFrameworks },
            );
          }
        }
      }

      for (const relativeSourceRoot of discoverConventionalPackageSourceRoots(
        rootDir,
        relativeDir,
      )) {
        addRoot(
          roots,
          rootDir,
          relativeSourceRoot,
          pkg.name ?? null,
          `build-config:${normalizeRelative(safeJoin(packageDir, fileName))}`,
          'build-config',
          { kind: packageKind, frameworks: packageFrameworks },
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
    if (!sourceExtensionsSet.has(path.extname(normalized))) continue;

    const sourceIndex = segments.findIndex((segment) => CONVENTIONAL_SOURCE_DIR_NAMES.has(segment));
    if (sourceIndex >= ZERO) {
      candidates.add(segments.slice(ZERO, sourceIndex + ONE).join('/'));
      continue;
    }

    let content = '';
    try {
      content = readTextFile(safeJoin(rootDir, normalized), 'utf8');
    } catch {
      content = '';
    }
    if (hasFrameworkFileSignal(content, normalized)) {
      const dynamicRoot = normalizeRelative(path.dirname(normalized));
      if (dynamicRoot && dynamicRoot !== '.') candidates.add(dynamicRoot);
    }
  }

  for (const relativePath of candidates) {
    const kind = inferKindFromFileEvidence(rootDir, relativePath);
    const basis: SourceRootEvidenceBasis = kind === 'unknown' ? 'file-evidence' : 'import-graph';
    addRoot(roots, rootDir, relativePath, null, `${basis}:source-files`, basis, { kind });
  }
}

function addWeakFallbackRoots(roots: Map<string, DetectedSourceRoot>, rootDir: string): void {
  if (roots.size > ZERO) return;

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
  const files = new Set<string>();
  for (const root of detectSourceRoots(rootDir)) {
    if (!pathExists(root.absolutePath)) continue;
    for (const entry of readDir(root.absolutePath, { recursive: true }) as string[]) {
      const relativeEntry = normalizeRelative(entry);
      if (hasSkippedSegment(relativeEntry)) continue;
      const extension = path.extname(relativeEntry);
      if (!root.languageExtensions.includes(extension)) continue;
      files.add(safeJoin(root.absolutePath, relativeEntry).split(path.sep).join('/'));
    }
  }
  return [...files].sort();
}
