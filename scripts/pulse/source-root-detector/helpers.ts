import * as path from 'path';
import { pathExists } from '../safe-fs';
import { safeJoin } from '../safe-path';
import {
  SourceRootKind,
  SourceRootLanguage,
  ZERO,
  SKIP_DIR_NAMES,
} from './types';

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

export function packageDependencyNames(pkg: import('./types').PackageJson): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > ZERO))].sort();
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

export function inferFrameworksFromPackage(
  pkg: import('./types').PackageJson,
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

export function inferKindFromPackage(
  pkg: import('./types').PackageJson,
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

const TOP_LEVEL_KIND_NAMES: Record<string, SourceRootKind> = {
  backend: 'backend',
  frontend: 'frontend',
  frontendadmin: 'frontend',
  worker: 'worker',
  e2e: 'script',
  scripts: 'script',
};

function guessKindFromDirName(relativeDir: string): SourceRootKind | null {
  const normalized = normalizeRelative(relativeDir);
  const topLevelSegment = normalized.split('/')[ZERO].toLowerCase();
  return TOP_LEVEL_KIND_NAMES[topLevelSegment] ?? null;
}

export function inferKindFromFileEvidence(rootDir: string, relativeDir: string): SourceRootKind {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return inferKind(relativeDir, null);

  const fromName = guessKindFromDirName(relativeDir);
  if (fromName) return fromName;

  return inferKind(relativeDir, null);
}

const DIR_FRAMEWORKS: Record<string, string[]> = {
  frontend: ['react'],
  backend: ['nestjs'],
  worker: ['bullmq'],
};

export function inferFrameworksFromFileEvidence(_rootDir: string, relativeDir: string): string[] {
  const normalized = normalizeRelative(relativeDir);
  const topLevelSegment = normalized.split('/')[ZERO].toLowerCase();
  return uniqueSorted(DIR_FRAMEWORKS[topLevelSegment] ?? []);
}

export function hasFrameworkFileSignal(content: string, relativeFile: string): boolean {
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

export function hasSkippedSegment(relativePath: string): boolean {
  return normalizeRelative(relativePath)
    .split('/')
    .some((part) => SKIP_DIR_NAMES.has(part));
}

export function walkUnskippedFiles(rootDir: string, relativeDir = ''): string[] {
  const baseRelative = normalizeRelative(relativeDir);
  const files: string[] = [];

  function walk(currentRelative: string): void {
    const absoluteDir = safeJoin(rootDir, baseRelative || '.', currentRelative || '.');
    const entries = readDir(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelative = normalizeRelative(safeJoin(currentRelative || '.', entry.name));
      const rootRelative = normalizeRelative(safeJoin(baseRelative || '.', entryRelative));
      if (hasSkippedSegment(rootRelative)) continue;

      if (entry.isDirectory()) {
        walk(entryRelative);
        continue;
      }

      files.push(entryRelative);
    }
  }

  walk('');
  return files.sort();
}
