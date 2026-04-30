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

  if (staticSegments.length === 0) return null;
  const last = staticSegments[staticSegments.length - 1];
  if (last && path.extname(last)) {
    staticSegments.pop();
  }
  if (staticSegments.length === 0) return null;
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
  if (sourceIndex < 0) return null;
  const sourceRoot = normalizeRelative(
    safeJoin(relativeDir, segments.slice(0, sourceIndex + 1).join('/')),
  );
  if (hasSkippedSegment(sourceRoot)) return null;
  return sourceRoot;
}

function sourceRootFromEntrypoint(relativeDir: string, entrypoint: string): string | null {
  const normalizedEntrypoint = normalizeRelative(entrypoint.replace(/^\.\//, ''));
  if (!normalizedEntrypoint || normalizedEntrypoint.includes('..')) return null;
  if (!SOURCE_EXTENSIONS.includes(path.extname(normalizedEntrypoint))) return null;
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
    if (!candidate.includes('..') && SOURCE_EXTENSIONS.includes(path.extname(candidate))) {
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
    return SOURCE_EXTENSIONS.includes(path.extname(normalized));
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
    if (SOURCE_EXTENSIONS.includes(ext)) found.add(ext);
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
    languageExtensions.length > 0 ? 'inferred' : 'not_available';
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
  return SOURCE_EXTENSIONS.some((extension) => entry.includes(extension));
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
    if (!SOURCE_EXTENSIONS.includes(path.extname(normalized))) continue;

    const sourceIndex = segments.findIndex((segment) => CONVENTIONAL_SOURCE_DIR_NAMES.has(segment));
    if (sourceIndex >= 0) {
      candidates.add(segments.slice(0, sourceIndex + 1).join('/'));
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
  if (roots.size > 0) return;

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

