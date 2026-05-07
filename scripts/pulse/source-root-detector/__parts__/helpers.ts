import * as path from 'path';
import { pathExists, readDir, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  SourceRootKind,
  SourceRootLanguage,
  sourceExtensionsSet,
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

export function inferKindFromFileEvidence(rootDir: string, relativeDir: string): SourceRootKind {
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

export function inferFrameworksFromFileEvidence(rootDir: string, relativeDir: string): string[] {
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
