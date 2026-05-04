import * as path from 'path';

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

export const CONVENTIONAL_SOURCE_DIR_NAMES = new Set(['src', 'app', 'pages', 'lib']);
export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
export const BUILD_CONFIG_FILES = new Set([
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
export const WEAK_FALLBACK_SEGMENTS: Array<{
  base: string;
  sourceDir: string;
  packageName: string | null;
}> = [
  { base: 'backend', sourceDir: 'src', packageName: null },
  { base: 'frontend', sourceDir: 'src', packageName: null },
  { base: 'worker', sourceDir: 'src', packageName: null },
];
export const SKIP_DIR_NAMES = new Set([
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

export function normalizeRelative(input: string): string {
  return input.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export function inferKind(relativePath: string, packageName: string | null): SourceRootKind {
  if (relativePath.startsWith('scripts/')) {
    return 'script';
  }
  if (packageName) {
    return 'library';
  }
  return 'unknown';
}

export function packageDependencyNames(pkg: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

export function languageForExtension(extension: string): SourceRootLanguage | null {
  if (extension === '.ts' || extension === '.tsx') return 'typescript';
  if (extension === '.js' || extension === '.jsx') return 'javascript';
  return null;
}

export function languagesForExtensions(extensions: string[]): SourceRootLanguage[] {
  return uniqueSorted(
    extensions.flatMap((extension) => {
      const language = languageForExtension(extension);
      return language ? [language] : [];
    }),
  ) as SourceRootLanguage[];
}
