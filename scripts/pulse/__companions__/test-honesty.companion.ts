export function detectWeakStatusAssertions(rootDir: string): WeakAssertionResult {
  const files: string[] = [];
  const rawSignals: WeakAssertionRawSignal[] = [];
  const candidates = walkSourceFiles(rootDir, (_relativePath, fileName) =>
    isTestFileName(fileName),
  );

  for (const candidate of candidates) {
    if (!hasWeakAssertionEvidence(parseTypeScriptFile(candidate.absolutePath))) {
      continue;
    }
    files.push(candidate.relativePath);
    rawSignals.push({
      file: candidate.relativePath,
      evidenceKind: 'ast',
      truthMode: 'weak_assertion',
      blocking: true,
    });
  }

  return { count: files.length, files, rawSignals };
}

export function detectTypeEscapeHatches(rootDir: string): TypeEscapeHatchResult {
  const locations: string[] = [];
  const candidates = walkSourceFiles(
    rootDir,
    (relativePath, fileName) =>
      isSourceFile(fileName) && !isTestFileName(fileName) && !isInTestDirectory(relativePath),
  );

  for (const candidate of candidates) {
    const lines = fs.readFileSync(candidate.absolutePath, 'utf-8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      for (const pattern of TYPE_ESCAPE_PATTERNS) {
        if (lineMatchesTypeEscape(lines[index], pattern)) {
          locations.push(`${candidate.relativePath}:${index + 1} (${pattern.label})`);
        }
      }
    }
  }

  return { count: locations.length, locations };
}

