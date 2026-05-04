/**
 * Read a JSON artifact at `filePath`.  Returns `null` for missing/unreadable files.
 */
function readJsonArtifact<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Resolve the most authoritative location of a Pulse artifact, preferring the
 * canonical `.pulse/current/` mirror and falling back to the repo-root copy.
 */
function findArtifact(rootDir: string, fileName: string): string | null {
  const canonical = path.join(rootDir, '.pulse', 'current', fileName);
  if (fs.existsSync(canonical)) {
    return canonical;
  }
  const fallback = path.join(rootDir, fileName);
  if (fs.existsSync(fallback)) {
    return fallback;
  }
  return null;
}

/**
 * Build a full PulseSnapshot from on-disk artifacts.  Reads:
 *   - PULSE_CERTIFICATE.json (score, blockingTier, gates)
 *   - PULSE_CODACY_STATE.json (HIGH count)
 *   - PULSE_HEALTH.json (runtime HIGH signals)
 *
 * Missing artifacts are treated as zero / empty so the snapshot is always well-formed.
 */
export function captureRegressionSnapshot(rootDir: string): PulseSnapshot {
  const certPath = findArtifact(rootDir, 'PULSE_CERTIFICATE.json');
  const codacyPath = findArtifact(rootDir, 'PULSE_CODACY_STATE.json');
  const healthPath = findArtifact(rootDir, 'PULSE_HEALTH.json');
  const executionMatrixPath = findArtifact(rootDir, 'PULSE_EXECUTION_MATRIX.json');
  const proofReadinessPath = findArtifact(rootDir, 'PULSE_PROOF_READINESS.json');

  const certificate = certPath
    ? readJsonArtifact<{
        score?: number;
        blockingTier?: number;
        gates?: Record<string, { status?: string }>;
        scenarios?: Record<string, { status?: string }>;
      }>(certPath)
    : null;
  const codacy = codacyPath
    ? readJsonArtifact<{ bySeverity?: { HIGH?: number } }>(codacyPath)
    : null;
  const health = healthPath
    ? readJsonArtifact<{ breaks?: Array<{ severity?: string }> }>(healthPath)
    : null;
  const executionMatrix = executionMatrixPath
    ? readJsonArtifact<{ summary?: PulseExecutionMatrixSummary }>(executionMatrixPath)
    : null;
  const proofReadiness = proofReadinessPath
    ? readJsonArtifact<{ summary?: Partial<PulseProofReadinessSummary> }>(proofReadinessPath)
    : null;

  const gatesPass: Record<string, boolean> = {};
  if (certificate?.gates) {
    for (const [name, value] of Object.entries(certificate.gates)) {
      gatesPass[name] = value?.status === 'pass';
    }
  }

  const scenarioPass: Record<string, boolean> = {};
  if (certificate?.scenarios) {
    for (const [id, value] of Object.entries(certificate.scenarios)) {
      scenarioPass[id] = value?.status === 'pass';
    }
  }

  const runtimeHighSignals = (health?.breaks || []).filter(
    (entry) => entry?.severity === 'critical' || entry?.severity === 'high',
  ).length;

  return {
    score: typeof certificate?.score === 'number' ? certificate.score : 0,
    blockingTier: typeof certificate?.blockingTier === 'number' ? certificate.blockingTier : 0,
    codacyHighCount: typeof codacy?.bySeverity?.HIGH === 'number' ? codacy.bySeverity.HIGH : 0,
    gatesPass,
    scenarioPass,
    runtimeHighSignals,
    executionMatrixSummary: executionMatrix?.summary ?? {},
    proofReadinessSummary: proofReadiness?.summary ?? {},
  };
}

/**
 * Return the list of repo-relative paths the unit modified relative to HEAD,
 * including both tracked changes and untracked files.  The returned paths are
 * scoped to `rootDir` and safe to feed into `rollbackRegression`.
 *
 * If `git` is not available or returns an error, an empty array is returned.
 */
export function detectChangedFilesSinceHead(rootDir: string): string[] {
  const tracked = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const out = new Set<string>();
  if (tracked.status === 0) {
    for (const line of (tracked.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  if (untracked.status === 0) {
    for (const line of (untracked.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return Array.from(out);
}

/**
 * Attempt to revert files to HEAD after a regression-triggering unit execution.
 *
 * Safety guarantees:
 *   1. Rollback is **scoped** — only paths in `unitFileScope` (relative to rootDir) are reverted.
 *      If `unitFileScope` is empty/null the function performs a no-op and returns `skipped: true`.
 *   2. Files outside the unit's declared scope are **never** touched, so unrelated uncommitted user
 *      work cannot be lost.
 *   3. Untracked files are only removed when they sit inside `unitFileScope`.
 *   4. `git` must be on PATH; otherwise the function returns `skipped: true` with a reason.
 */
export function rollbackRegression(
  rootDir: string,
  unitFileScope: string[] | null | undefined,
  reason: string,
): RollbackOutcome {
  const scope = (unitFileScope || []).filter(
    (entry) => typeof entry === 'string' && entry.length > 0,
  );

  if (scope.length === 0) {
    return {
      attempted: false,
      revertedFiles: [],
      removedUntracked: [],
      skipped: true,
      summary: `Rollback skipped: unit declared no file scope (${reason}).`,
    };
  }

  const gitCheck = spawnSync('git', ['--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (gitCheck.status !== 0) {
    return {
      attempted: false,
      revertedFiles: [],
      removedUntracked: [],
      skipped: true,
      summary: `Rollback skipped: git not available (${reason}).`,
    };
  }

  const revertedFiles: string[] = [];
  const removedUntracked: string[] = [];

  for (const relativePath of scope) {
    const absolutePath = path.join(rootDir, relativePath);
    // Detect whether this path is tracked at HEAD.
    const lsTree = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', relativePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const trackedAtHead = lsTree.status === 0 && (lsTree.stdout || '').trim().length > 0;

    if (trackedAtHead) {
      const checkout = spawnSync('git', ['checkout', 'HEAD', '--', relativePath], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (checkout.status === 0) {
        revertedFiles.push(relativePath);
      }
    } else if (fs.existsSync(absolutePath)) {
      // File is untracked (created by the unit) — remove it, but only if path is inside rootDir.
      const resolved = path.resolve(absolutePath);
      const resolvedRoot = path.resolve(rootDir);
      if (resolved.startsWith(`${resolvedRoot}${path.sep}`) || resolved === resolvedRoot) {
        try {
          const stat = fs.lstatSync(resolved);
          if (stat.isDirectory()) {
            fs.rmSync(resolved, { recursive: true, force: true });
          } else {
            fs.unlinkSync(resolved);
          }
          removedUntracked.push(relativePath);
        } catch {
          // best-effort: ignore individual file errors
        }
      }
    }
  }

  const summary =
    revertedFiles.length === 0 && removedUntracked.length === 0
      ? `Rollback no-op: nothing to revert (${reason}).`
      : `Rolled back ${revertedFiles.length} tracked file(s) and removed ${removedUntracked.length} untracked path(s) due to ${reason}.`;

  return {
    attempted: true,
    revertedFiles,
    removedUntracked,
    skipped: false,
    summary,
  };
}

// Hard-enforcement helpers (RegressionError / throwOnRegression) are co-located
// in a sibling module to keep this file under the new-file size cap.  They are
// re-exported here so existing call sites (`from './regression-guard'`) continue
// to work without churn.
export { RegressionError, throwOnRegression } from './regression-guard.hard-enforcement';

// ── Moved from regression-guard.ts ──────────────────────────────────────

export interface RollbackOutcome {
  attempted: boolean;
  revertedFiles: string[];
  removedUntracked: string[];
  summary: string;
  skipped: boolean;
}
