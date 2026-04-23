import * as path from 'path';
import type { PulseConfig } from './types';
import { pathExists, readDir, readJsonFile } from './safe-fs';
import { safeJoin } from './safe-path';

const IGNORED_ROOT_DIRS = new Set([
  '.git',
  '.next',
  '.pulse',
  'backend',
  'dist',
  'docker',
  'docs',
  'e2e',
  'node_modules',
  'nginx',
  'scripts',
  'worker',
]);

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

function discoverFrontendSourceDirs(config: PulseConfig): string[] {
  const discovered: string[] = [];
  const rootEntries = readDir(config.rootDir, { withFileTypes: true });

  for (const entry of rootEntries) {
    if (!entry.isDirectory() || IGNORED_ROOT_DIRS.has(entry.name)) {
      continue;
    }
    if (entry.name.startsWith('.') && entry.name !== '.agents') {
      continue;
    }

    const appRoot = safeJoin(config.rootDir, entry.name);
    const packagePath = safeJoin(appRoot, 'package.json');
    const srcPath = safeJoin(appRoot, 'src');
    const sourceDir = pathExists(srcPath) ? srcPath : appRoot;

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
  return unique([
    config.frontendDir,
    ...(config.frontendDirs || []),
    ...discoverFrontendSourceDirs(config),
  ])
    .filter(Boolean)
    .map((dir) => path.resolve(dir));
}
