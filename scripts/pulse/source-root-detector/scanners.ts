import * as path from 'path';
import { pathExists, readDir, statPath } from '../safe-fs';
import { safeJoin } from '../safe-path';
import {
  DetectedSourceRoot,
  PackageJson,
  TsConfigJson,
  SourceRootEvidenceBasis,
  CONVENTIONAL_SOURCE_DIR_NAMES,
  BUILD_CONFIG_FILES,
  SKIP_DIR_NAMES,
} from './types';
import {
  normalizeRelative,
  inferKindFromPackage,
  inferFrameworksFromPackage,
  uniqueSorted,
  walkUnskippedFiles,
} from './helpers';
import {
  addRoot,
  sourceRootFromEntrypoint,
  sourceRootFromPathEntry,
  sourceRootFromPatternEntry,
  sourceEntrypointsFromText,
  packageManifestEntries,
  entryMentionsSourceFile,
} from './source-resolution';
import { readJsonOrNull } from './package-discovery';

function collectConfigsInDir(absoluteDir: string, relativePrefix: string, maxDepth: number): string[] {
  if (maxDepth <= 0) return [];
  const configs: string[] = [];
  let entries: string[];
  try {
    entries = readDir(absoluteDir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry) || entry.startsWith('.')) continue;
    const entryPath = safeJoin(absoluteDir, entry);
    const relPath = relativePrefix ? `${relativePrefix}/${entry}` : entry;
    if (/^[tj]sconfig(?:\.[\w-]+)?\.json$/.test(entry)) {
      configs.push(relPath);
    }
    try {
      if (statPath(entryPath).isDirectory()) {
        configs.push(...collectConfigsInDir(entryPath, relPath, maxDepth - 1));
      }
    } catch {
      continue;
    }
  }
  return configs;
}

export function discoverProjectConfigs(rootDir: string, packages?: Map<string, unknown>): string[] {
  const configDirs = new Set<string>([rootDir]);
  if (packages) {
    for (const relativeDir of packages.keys()) {
      if (relativeDir) configDirs.add(safeJoin(rootDir, relativeDir));
    }
  }
  const configs: string[] = [];
  for (const dir of configDirs) {
    const prefix = path.relative(rootDir, dir);
    const relativePrefix = prefix === '' ? '' : normalizeRelative(prefix);
    configs.push(...collectConfigsInDir(dir, relativePrefix, 2));
  }
  return configs;
}

export function discoverPackageEntrypoints(pkg: PackageJson): string[] {
  return uniqueSorted(
    packageManifestEntries(pkg).flatMap((entry) => sourceEntrypointsFromText(entry)),
  );
}

export function discoverConventionalPackageSourceRoots(
  rootDir: string,
  relativeDir: string,
): string[] {
  const base = relativeDir || '.';
  return [...CONVENTIONAL_SOURCE_DIR_NAMES]
    .map((dirName) => normalizeRelative(safeJoin(base, dirName)))
    .filter((candidate) => pathExists(safeJoin(rootDir, candidate)));
}

export function addPackageRoots(
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

export function addTsConfigRoots(
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

  for (const configPath of discoverProjectConfigs(rootDir, packages)) {
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
        const pkgKind = kindByDir.get(packageDir);
        const pkgFrameworks = frameworksByDir.get(packageDir);
        addRoot(roots, rootDir, root, packageName, `${basis}:${configPath}`, basis, {
          ...(pkgKind !== undefined ? { kind: pkgKind } : {}),
          ...(pkgFrameworks !== undefined ? { frameworks: pkgFrameworks } : {}),
        });
      }
    }
  }
}

export function discoverBuildConfigRoots(
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
