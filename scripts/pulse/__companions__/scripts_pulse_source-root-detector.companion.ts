function listPackageDirs(rootDir: string): Map<string, PackageJson> {
  const packages = new Map<string, PackageJson>();
  const rootPackage = readJsonOrNull<PackageJson>(safeJoin(rootDir, 'package.json'));
  if (rootPackage) packages.set('', rootPackage);
  for (const relativeDir of packageDirsFromWorkspaces(rootDir, workspacePatterns(rootPackage))) {
    const pkg = readJsonOrNull<PackageJson>(safeJoin(rootDir, relativeDir, 'package.json'));
    if (pkg) packages.set(relativeDir, pkg);
  }
  for (const entry of readDir(rootDir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const pkg = readJsonOrNull<PackageJson>(safeJoin(rootDir, entry, 'package.json'));
    if (pkg) packages.set(normalizeRelative(entry), pkg);
  }
  return packages;
}

function manifestTextEntries(pkg: PackageJson): string[] {
  const entries: string[] = [];
  for (const value of [pkg.main, pkg.module, pkg.types]) {
    if (typeof value === 'string') entries.push(value);
  }
  entries.push(...Object.values(pkg.scripts ?? {}));
  return entries;
}

function staticRootFromEntry(relativeDir: string, entry: string): string | null {
  const normalized = normalizeRelative(entry.replace(/^\.\//, ''));
  if (!normalized || normalized.includes('..')) return null;
  const sourceSegments = normalized.split('/');
  const sourceIndex = sourceSegments.findIndex((segment) =>
    CONVENTIONAL_SOURCE_DIR_NAMES.has(segment),
  );
  if (sourceIndex >= 0) {
    return normalizeRelative(
      safeJoin(relativeDir || '.', sourceSegments.slice(0, sourceIndex + 1).join('/')),
    );
  }
  if (SOURCE_EXTENSIONS.includes(path.extname(normalized))) {
    const dirname = path.dirname(normalized);
    return normalizeRelative(safeJoin(relativeDir || '.', dirname === '.' ? '.' : dirname));
  }
  const wildcardIndex = normalized.indexOf('*');
  if (wildcardIndex >= 0) {
    const prefix = normalized.slice(0, wildcardIndex);
    const segments = prefix.split('/').filter(Boolean);
    while (segments.length > 0 && path.extname(segments[segments.length - 1])) segments.pop();
    if (segments.length > 0)
      return normalizeRelative(safeJoin(relativeDir || '.', segments.join('/')));
  }
  return null;
}

function sourceEntriesFromText(entry: string): string[] {
  const found: string[] = [];
  const sourceFilePattern =
    /(?:^|[\s"'`=:,(])((?:\.{1,2}\/)?[^\s"'`),;]+?\.(?:tsx?|jsx?))(?:$|[\s"'`),;:])/g;
  for (const match of entry.matchAll(sourceFilePattern)) {
    found.push(match[1]);
  }
  return found;
}

function sourceFileExtensionsFor(rootDir: string, relativeDir: string): string[] {
  const absoluteDir = safeJoin(rootDir, relativeDir);
  if (!pathExists(absoluteDir)) return [];
  const extensions = new Set<string>();
  for (const entry of readDir(absoluteDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (hasSkippedSegment(normalized)) continue;
    const extension = path.extname(normalized);
    if (SOURCE_EXTENSIONS.includes(extension)) extensions.add(extension);
  }
  return [...extensions].sort();
}

function hasSourceEvidence(rootDir: string, relativeDir: string): boolean {
  return sourceFileExtensionsFor(rootDir, relativeDir).length > 0;
}

function addDetectedRoot(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  relativePath: string,
  evidence: string,
  evidenceBasis: SourceRootEvidenceBasis,
  options: {
    packageName?: string | null;
    kind?: SourceRootKind;
    frameworks?: string[];
    entrypoints?: string[];
    weakCandidate?: boolean;
  } = {},
): void {
  const normalized = normalizeRelative(relativePath);
  if (!normalized || hasSkippedSegment(normalized)) return;
  const weakCandidate = options.weakCandidate === true;
  const languageExtensions = sourceFileExtensionsFor(rootDir, normalized);
  if (!weakCandidate && languageExtensions.length === 0) return;
  const fileEvidenceKind = inferKindFromFileEvidence(rootDir, normalized);
  const declaredKind = options.kind ?? inferKind(normalized, options.packageName ?? null);
  const kind =
    declaredKind === 'unknown' || declaredKind === 'library' ? fileEvidenceKind : declaredKind;
  const evidenceBasisList: SourceRootEvidenceBasis[] =
    fileEvidenceKind === 'unknown' ? [evidenceBasis] : [evidenceBasis, 'import-graph'];
  const frameworks = uniqueSorted([
    ...(options.frameworks ?? []),
    ...inferFrameworksFromFileEvidence(rootDir, normalized),
  ]);
  const entrypoints = uniqueSorted((options.entrypoints ?? []).map(normalizeRelative));
  const existing = roots.get(normalized);
  if (existing) {
    if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    for (const basis of evidenceBasisList) {
      if (!existing.evidenceBasis.includes(basis)) existing.evidenceBasis.push(basis);
    }
    if (existing.kind === 'unknown' || existing.kind === 'library') existing.kind = kind;
    existing.languageExtensions = uniqueSorted([
      ...existing.languageExtensions,
      ...languageExtensions,
    ]);
    existing.languages = languagesForExtensions(existing.languageExtensions);
    existing.frameworks = uniqueSorted([...existing.frameworks, ...frameworks]);
    existing.entrypoints = uniqueSorted([...existing.entrypoints, ...entrypoints]);
    if (existing.availability === 'not_available' && languageExtensions.length > 0) {
      existing.availability = 'inferred';
      existing.unavailableReason = null;
    }
    existing.weakCandidate = existing.weakCandidate && weakCandidate;
    return;
  }
  roots.set(normalized, {
    relativePath: normalized,
    absolutePath: path.resolve(rootDir, normalized),
    kind,
    packageName: options.packageName ?? null,
    evidence: [evidence],
    evidenceBasis: evidenceBasisList,
    availability: languageExtensions.length > 0 ? 'inferred' : 'not_available',
    unavailableReason:
      languageExtensions.length > 0
        ? null
        : 'source root exists but no scannable source files were found',
    weakCandidate,
    languageExtensions,
    languages: languagesForExtensions(languageExtensions),
    frameworks,
    entrypoints,
  });
}

function addPackageEvidenceRoots(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  packages: Map<string, PackageJson>,
): void {
  for (const [relativeDir, pkg] of packages) {
    const kind = inferKindFromPackage(pkg, rootDir, relativeDir);
    const frameworks = inferFrameworksFromPackage(pkg, rootDir, relativeDir);
    for (const dirName of CONVENTIONAL_SOURCE_DIR_NAMES) {
      const candidate = normalizeRelative(safeJoin(relativeDir || '.', dirName));
      if (pathExists(safeJoin(rootDir, candidate))) {
        addDetectedRoot(
          roots,
          rootDir,
          candidate,
          `package:${relativeDir || '.'}`,
          'package-manifest',
          {
            packageName: pkg.name ?? null,
            kind,
            frameworks,
          },
        );
      }
    }
    for (const entry of manifestTextEntries(pkg)) {
      const entries = [entry, ...sourceEntriesFromText(entry)];
      for (const candidateEntry of entries) {
        const root = staticRootFromEntry(relativeDir || '.', candidateEntry);
        if (root) {
          addDetectedRoot(
            roots,
            rootDir,
            root,
            `package-entry:${relativeDir || '.'}`,
            'package-manifest',
            {
              packageName: pkg.name ?? null,
              kind,
              frameworks,
              entrypoints: sourceEntriesFromText(entry).map((item) =>
                normalizeRelative(safeJoin(relativeDir || '.', item.replace(/^\.\//, ''))),
              ),
            },
          );
        }
      }
    }
  }
}

function addConfigEvidenceRoots(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  packages: Map<string, PackageJson>,
): void {
  for (const entry of readDir(rootDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (hasSkippedSegment(normalized)) continue;
    if (!/^[tj]sconfig(?:\.[\w-]+)?\.json$/.test(path.basename(normalized))) continue;
    const config = readJsonOrNull<TsConfigJson>(safeJoin(rootDir, normalized));
    if (!config) continue;
    const configDir = normalizeRelative(path.dirname(normalized));
    const packageDir = configDir === '.' ? '' : configDir;
    const pkg = packages.get(packageDir) ?? null;
    const basis: SourceRootEvidenceBasis = path.basename(normalized).startsWith('jsconfig')
      ? 'jsconfig'
      : 'tsconfig';
    const entries = [
      ...(config.files ?? []),
      ...(config.include ?? []),
      ...(config.compilerOptions?.rootDir ? [config.compilerOptions.rootDir] : []),
      ...(config.compilerOptions?.baseUrl ? [config.compilerOptions.baseUrl] : []),
      ...Object.values(config.compilerOptions?.paths ?? {}).flat(),
    ];
    for (const configEntry of entries) {
      const root = staticRootFromEntry(configDir === '.' ? '.' : configDir, configEntry);
      if (root) {
        addDetectedRoot(roots, rootDir, root, `${basis}:${normalized}`, basis, {
          packageName: pkg?.name ?? null,
          kind: pkg ? inferKindFromPackage(pkg, rootDir, packageDir) : undefined,
          frameworks: pkg ? inferFrameworksFromPackage(pkg, rootDir, packageDir) : undefined,
        });
      }
    }
  }
}

function addBuildConfigEvidenceRoots(
  roots: Map<string, DetectedSourceRoot>,
  rootDir: string,
  packages: Map<string, PackageJson>,
): void {
  for (const [relativeDir, pkg] of packages) {
    const packageDir = relativeDir || '.';
    const kind = inferKindFromPackage(pkg, rootDir, relativeDir);
    const frameworks = inferFrameworksFromPackage(pkg, rootDir, relativeDir);
    for (const fileName of BUILD_CONFIG_FILES) {
      const configPath = safeJoin(rootDir, packageDir, fileName);
      if (!pathExists(configPath)) continue;
      if (fileName === 'nest-cli.json') {
        const nestConfig = readJsonOrNull<{ sourceRoot?: string }>(configPath);
        if (typeof nestConfig?.sourceRoot === 'string') {
          const root = staticRootFromEntry(packageDir, nestConfig.sourceRoot);
          if (root) {
            addDetectedRoot(roots, rootDir, root, `build-config:${fileName}`, 'build-config', {
              packageName: pkg.name ?? null,
              kind,
              frameworks,
            });
          }
        }
      }
      for (const dirName of CONVENTIONAL_SOURCE_DIR_NAMES) {
        const candidate = normalizeRelative(safeJoin(packageDir, dirName));
        if (pathExists(safeJoin(rootDir, candidate))) {
          addDetectedRoot(roots, rootDir, candidate, `build-config:${fileName}`, 'build-config', {
            packageName: pkg.name ?? null,
            kind,
            frameworks,
          });
        }
      }
    }
  }
}

function addFileEvidenceRoots(roots: Map<string, DetectedSourceRoot>, rootDir: string): void {
  for (const entry of readDir(rootDir, { recursive: true }) as string[]) {
    const normalized = normalizeRelative(entry);
    if (hasSkippedSegment(normalized)) continue;
    if (!SOURCE_EXTENSIONS.includes(path.extname(normalized))) continue;
    const segments = normalized.split('/');
    const sourceIndex = segments.findIndex((segment) => CONVENTIONAL_SOURCE_DIR_NAMES.has(segment));
    let root: string | null = null;
    if (sourceIndex >= 0) root = segments.slice(0, sourceIndex + 1).join('/');
    if (!root) {
      let content = '';
      try {
        content = readTextFile(safeJoin(rootDir, normalized), 'utf8');
      } catch {
        content = '';
      }
      if (hasFrameworkFileSignal(content, normalized))
        root = normalizeRelative(path.dirname(normalized));
    }
    if (!root || root === '.') continue;
    const kind = inferKindFromFileEvidence(rootDir, root);
    const basis: SourceRootEvidenceBasis = kind === 'unknown' ? 'file-evidence' : 'import-graph';
    addDetectedRoot(roots, rootDir, root, `${basis}:source-files`, basis, { kind });
  }
}

function addWeakFallbackRoots(roots: Map<string, DetectedSourceRoot>, rootDir: string): void {
  if (roots.size > 0) return;
  for (const fallback of WEAK_FALLBACK_SEGMENTS) {
    const relativePath = normalizeRelative(safeJoin(fallback.base, fallback.sourceDir));
    if (pathExists(safeJoin(rootDir, relativePath))) {
      addDetectedRoot(
        roots,
        rootDir,
        relativePath,
        'weak-fallback:conventional-source-root-exists-without-manifest-evidence',
        'weak-fallback',
        { weakCandidate: true, packageName: fallback.packageName },
      );
    }
  }
}

export function detectSourceRoots(rootDir: string): DetectedSourceRoot[] {
  const absoluteRoot = path.resolve(rootDir);
  const roots = new Map<string, DetectedSourceRoot>();
  const packages = listPackageDirs(absoluteRoot);
  addPackageEvidenceRoots(roots, absoluteRoot, packages);
  addConfigEvidenceRoots(roots, absoluteRoot, packages);
  addBuildConfigEvidenceRoots(roots, absoluteRoot, packages);
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
