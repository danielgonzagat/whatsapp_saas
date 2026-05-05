import * as path from 'path';
import { pathExists, readDir } from '../safe-fs';
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

export function discoverProjectConfigs(rootDir: string): string[] {
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
