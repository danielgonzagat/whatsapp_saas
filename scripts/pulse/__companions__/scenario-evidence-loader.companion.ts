/** Load scenario evidence from canonical PULSE disk artifacts. */
export function loadScenarioEvidenceFromDisk(rootDir: string): DiskScenarioEvidence {
  const bundle: DiskScenarioEvidence = {
    customer: null,
    operator: null,
    admin: null,
    soak: null,
    summary: '',
    results: [],
  };
  const summaryParts: string[] = [];

  for (const fileName of discoverEvidenceFileNames(rootDir)) {
    const fallbackKey = inferActorEvidenceKeyFromFileName(fileName);
    const summaryKey = fallbackKey ?? fileName;
    const filePath = resolveEvidencePath(rootDir, fileName);
    if (!filePath) {
      summaryParts.push(`${summaryKey}: no file`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = readJson(filePath);
    } catch {
      summaryParts.push(`${summaryKey}: parse error`);
      continue;
    }

    let fresh = isFresh(filePath);
    if (!fresh && isRefreshableNonRunEvidence(parsed)) {
      parsed = normalizeStaleNonRunEvidenceForRead(parsed, fallbackKey);
    }
    const evidence = normalizeActorEvidence(parsed, fallbackKey, fresh);
    if (!evidence) {
      summaryParts.push(`${summaryKey}: invalid structure`);
      continue;
    }

    const key = evidence.actorKind;
    bundle[key] = evidence;
    bundle.results.push(...evidence.results);
    summaryParts.push(`${key}: ${fresh ? 'fresh' : 'stale'} (${evidence.results.length})`);
  }

  bundle.summary = summaryParts.join('; ');
  return bundle;
}

