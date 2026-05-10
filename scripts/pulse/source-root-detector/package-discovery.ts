import { pathExists, readDir, readJsonFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { ZERO, SKIP_DIR_NAMES } from './types';
import type { PackageJson } from './types';
import { normalizeRelative } from './helpers';

export function readJsonOrNull<T>(filePath: string): T | null {
  try {
    if (!pathExists(filePath)) return null;
    return readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

export function workspacePatterns(pkg: PackageJson | null): string[] {
  if (!pkg?.workspaces) return [];
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
  return pkg.workspaces.packages ?? [];
}

export function packageDirsFromWorkspaces(rootDir: string, patterns: string[]): string[] {
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

export function discoverPackageDirs(rootDir: string): Map<string, PackageJson> {
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
