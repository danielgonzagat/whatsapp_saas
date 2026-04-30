function walkWorkspaceStructure(
  rootDir: string,
  currentDir: string,
  depth: number,
  structure: WorkspaceStructure,
): void {
  if (depth > PACKAGE_SCAN_MAX_DEPTH) {
    return;
  }
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const absolute = path.join(currentDir, entry.name);
    const relPath = normalizePath(path.relative(rootDir, absolute));
    if (entry.isDirectory()) {
      if (!PACKAGE_SCAN_SKIP_SEGMENTS.has(entry.name)) {
        walkWorkspaceStructure(rootDir, absolute, depth + 1, structure);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === 'package.json') {
      const pkg = readPackageJson(absolute);
      if (pkg) {
        const relRoot = normalizePath(path.dirname(relPath));
        if (relRoot !== '.') {
          structure.packageRoots.push({
            root: relRoot,
            surface: inferPackageSurface(pkg, relRoot),
          });
        }
        addPackageEntrypointRoots(structure, pkg, relRoot);
        addScriptRoots(structure, pkg, relRoot);
        addPrismaRootFromPackage(structure, pkg, relRoot);
        addRootSegmentsToNoise(structure, relRoot);
      }
    }
    if (entry.name.startsWith('tsconfig') && entry.name.endsWith('.json')) {
      addDirectoryRoot(structure.tsconfigRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
    if (entry.name === 'schema.prisma' || entry.name === 'migration.sql') {
      addDirectoryRoot(structure.prismaRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
    if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      addDirectoryRoot(structure.documentRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
    if (SOURCE_SIGNAL_EXTENSIONS.has(path.extname(entry.name))) {
      const surface = inferSourceSurface(readFileSync(absolute, 'utf8'), entry.name);
      if (surface) {
        const root = sourceSignalRoot(relPath);
        structure.sourceSignalRoots.push({ root, surface });
        addRootSegmentsToNoise(structure, root);
      }
    }
    if (
      entry.name === 'Dockerfile' ||
      entry.name.startsWith('Dockerfile.') ||
      entry.name.endsWith('.conf')
    ) {
      addDirectoryRoot(structure.infrastructureRoots, relPath);
      addRootSegmentsToNoise(structure, path.dirname(relPath));
    }
  }
}

export function discoverWorkspaceStructure(rootDir: string): WorkspaceStructure {
  const resolvedRoot = path.resolve(rootDir);
  const cached = structureCache.get(resolvedRoot);
  if (cached) {
    return cached;
  }
  const structure: WorkspaceStructure = {
    packageRoots: [],
    sourceSignalRoots: [],
    tsconfigRoots: new Set<string>(),
    prismaRoots: new Set<string>(),
    scriptRoots: new Set<string>(),
    documentRoots: new Set<string>(),
    infrastructureRoots: new Set<string>(),
    protectedExact: new Set<string>(),
    protectedPrefixes: new Set<string>(),
    structuralNoiseSegments: new Set(STRUCTURAL_NOISE_SEGMENTS),
  };
  if (existsSync(resolvedRoot) && statSync(resolvedRoot).isDirectory()) {
    walkWorkspaceStructure(resolvedRoot, resolvedRoot, 0, structure);
    addGovernanceBoundary(structure, resolvedRoot);
  }
  structure.packageRoots.sort((left, right) => right.root.length - left.root.length);
  structure.sourceSignalRoots.sort((left, right) => right.root.length - left.root.length);
  structureCache.set(resolvedRoot, structure);
  return structure;
}

