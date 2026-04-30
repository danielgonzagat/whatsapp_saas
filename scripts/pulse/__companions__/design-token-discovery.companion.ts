function uniqueEvidence(
  evidence: DiscoveredDesignColorEvidence[],
): DiscoveredDesignColorEvidence[] {
  const seen = new Set<string>();
  const unique: DiscoveredDesignColorEvidence[] = [];
  for (const item of evidence) {
    const key = [
      item.normalizedValue,
      item.sourcePath,
      item.sourceKind,
      item.line,
      item.tokenName ?? '',
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique.sort((left, right) => {
    if (left.sourcePath !== right.sourcePath) {
      return left.sourcePath.localeCompare(right.sourcePath);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.normalizedValue.localeCompare(right.normalizedValue);
  });
}

export function discoverDesignTokens(
  rootDir: string,
  options: DesignTokenDiscoveryOptions = {},
): DesignTokenDiscoveryResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const evidence: DiscoveredDesignColorEvidence[] = [];
  const scannedFiles: string[] = [];

  for (const relativePath of discoverCandidateFiles(rootDir, maxDepth)) {
    const absolutePath = safeJoin(rootDir, relativePath);
    const sourcePath = toRelativePath(rootDir, absolutePath);
    const content = readTextFile(absolutePath, 'utf8');
    const sourceKinds = classifySource(sourcePath);
    const cssVariableEvidence = extractCssVariableColors(content, sourcePath);

    if (cssVariableEvidence.length > 0) {
      scannedFiles.push(sourcePath);
      evidence.push(...cssVariableEvidence);
    }

    for (const sourceKind of sourceKinds) {
      const tokenEvidence = extractTokenSourceColors(content, sourcePath, sourceKind);
      if (tokenEvidence.length > 0) {
        scannedFiles.push(sourcePath);
        evidence.push(...tokenEvidence);
      }
    }
  }

  const colors = uniqueEvidence(evidence);
  return {
    colors,
    allowedColors: [...new Set(colors.map((color) => color.normalizedValue))].sort(),
    scannedFiles: [...new Set(scannedFiles)].sort(),
  };
}

export function isDiscoveredDesignColor(
  value: string,
  discovery: DesignTokenDiscoveryResult,
): boolean {
  return discovery.allowedColors.includes(normalizeColorValue(value));
}

export function findDiscoveredDesignColorEvidence(
  value: string,
  discovery: DesignTokenDiscoveryResult,
): DiscoveredDesignColorEvidence[] {
  const normalizedValue = normalizeColorValue(value);
  return discovery.colors.filter((color) => color.normalizedValue === normalizedValue);
}

