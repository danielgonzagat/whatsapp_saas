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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
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

function inferFrameworksFromFileEvidence(rootDir: string, relativeDir: string): string[] {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return [];

  const frameworks: string[] = [];
  for (const entry of readDir(absoluteDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))) continue;
    const ext = path.extname(normalized);
    if (!SOURCE_EXTENSIONS.includes(ext)) continue;

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
