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

// ── Moved from test-honesty.ts ──────────────────────────────────────────

export function detectPlaceholderTests(rootDir: string): PlaceholderTestResult {
  const files = walkSourceFiles(rootDir, (_relativePath, fileName) => isTestFileName(fileName))
    .filter((candidate) => hasPlaceholderEvidence(parseTypeScriptFile(candidate.absolutePath)))
    .map((candidate) => candidate.relativePath);

  return { count: files.length, files };
}

function hasMarkerAt(line: string, marker: string, index: number): boolean {
  return line.slice(index, index + marker.length) === marker;
}

function hasIdentifierBoundary(line: string, index: number, marker: string): boolean {
  const before = index > 0 ? line[index - 1] : '';
  const afterIndex = index + marker.length;
  const after = afterIndex < line.length ? line[afterIndex] : '';
  return !isIdentifierCharacter(before) && !isIdentifierCharacter(after);
}

function isIdentifierCharacter(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const code = value.charCodeAt(0);
  const isLower = code >= 97 && code <= 122;
  const isUpper = code >= 65 && code <= 90;
  const isDigit = code >= 48 && code <= 57;
  return isLower || isUpper || isDigit || value === '_' || value === '$';
}

function lineMatchesTypeEscape(line: string, pattern: TypeEscapePattern): boolean {
  for (let index = 0; index <= line.length - pattern.marker.length; index += 1) {
    if (!hasMarkerAt(line, pattern.marker, index)) {
      continue;
    }
    if (pattern.requiresWordBoundary && !hasIdentifierBoundary(line, index, pattern.marker)) {
      continue;
    }
    return true;
  }
  return false;
}
