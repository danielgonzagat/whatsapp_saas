import * as path from 'path';
import type { PulseConfig } from './types.manifest';
import { pathExists, readDir, readJsonFile } from './safe-fs';
import { safeJoin } from './safe-path';
import { detectSourceRoots } from './source-root-detector/api';

const IGNORED_ROOT_DIRS = new Set(['.git', '.next', '.pulse', 'dist', 'node_modules']);
const frontendSourceDirCache = new Map<string, string[]>();

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function hasFrontendDependency(pkg: Record<string, unknown>): boolean {
  const deps = {
    ...((pkg.dependencies as Record<string, string> | undefined) || {}),
    ...((pkg.devDependencies as Record<string, string> | undefined) || {}),
  };

  return ['next', 'react', 'vite', '@vitejs/plugin-react'].some((name) => name in deps);
}

function hasFrontendStructure(sourceDir: string): boolean {
  return ['app', 'pages', 'components', 'lib'].some((entry) =>
    pathExists(safeJoin(sourceDir, entry)),
  );
}
function isRuntimeFrontendRoot(root: ReturnType<typeof detectSourceRoots>[number]): boolean {
  return (
    root.availability === 'inferred' &&
    root.kind === 'frontend' &&
    root.relativePath !== 'scripts' &&
    !root.relativePath.startsWith('scripts/') &&
    !root.relativePath.includes('/__parts__/') &&
    !root.relativePath.includes('/__companions__/')
  );
}

function sourceDirForFrontendRoot(rootDir: string): string {
  if (path.basename(rootDir) === 'src') {
    return rootDir;
  }
  const srcPath = safeJoin(rootDir, 'src');
  return pathExists(srcPath) ? srcPath : rootDir;
}

function discoverFrontendSourceDirs(config: PulseConfig): string[] {
  const discovered: string[] = [];
  for (const root of detectSourceRoots(config.rootDir)) {
    if (isRuntimeFrontendRoot(root)) {
      discovered.push(sourceDirForFrontendRoot(root.absolutePath));
    }
  }

  const rootEntries = readDir(config.rootDir, { withFileTypes: true });

  for (const entry of rootEntries) {
    if (!entry.isDirectory() || IGNORED_ROOT_DIRS.has(entry.name) || entry.name === 'scripts') {
      continue;
    }
    if (entry.name.startsWith('.') && entry.name !== '.agents') {
      continue;
    }

    const appRoot = safeJoin(config.rootDir, entry.name);
    const packagePath = safeJoin(appRoot, 'package.json');
    const sourceDir = sourceDirForFrontendRoot(appRoot);

    if (!pathExists(packagePath) || !pathExists(sourceDir)) {
      continue;
    }

    try {
      const pkg = readJsonFile<Record<string, unknown>>(packagePath);
      if (hasFrontendDependency(pkg) && hasFrontendStructure(sourceDir)) {
        discovered.push(sourceDir);
      }
    } catch {
      // Ignore malformed package metadata; the primary configured frontend still applies.
    }
  }

  return discovered;
}

/** Get frontend source dirs. */
export function getFrontendSourceDirs(config: PulseConfig): string[] {
  const cacheKey = JSON.stringify([config.rootDir, config.frontendDir, config.frontendDirs || []]);
  const cached = frontendSourceDirCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const sourceDirs = unique(
    [config.frontendDir, ...(config.frontendDirs || []), ...discoverFrontendSourceDirs(config)]
      .filter(Boolean)
      .map(sourceDirForFrontendRoot),
  ).map((dir) => path.resolve(dir));
  frontendSourceDirCache.set(cacheKey, sourceDirs);
  return sourceDirs;
}
