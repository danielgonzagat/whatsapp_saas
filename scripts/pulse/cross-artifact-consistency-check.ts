/**
 * PULSE Cross-Artifact Consistency Check
 *
 * Verifies that key fields are coherent across all PULSE artifacts.
 * PULSE self-trust must fail when artifacts contradict each other.
 *
 * Artifacts checked:
 *   Root:           PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_ARTIFACT_INDEX.json
 *   .pulse/current: PULSE_AUTONOMY_PROOF.json, PULSE_AUTONOMY_STATE.json,
 *                   PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_EXTERNAL_SIGNAL_STATE.json,
 *                   PULSE_CONVERGENCE_PLAN.json, PULSE_PRODUCT_VISION.json
 */

import * as path from 'path';
import * as fs from 'fs';

/** A single divergence found between two or more artifacts. */
export interface ArtifactDivergence {
  /** The field name where values differ. */
  field: string;
  /** Mapping of artifact file → value found at that field. */
  values: Record<string, unknown>;
  /** Artifact source file paths that contributed conflicting values. */
  sources: string[];
}

/** Result of the cross-artifact consistency check. */
export interface ConsistencyResult {
  /** True when no divergences were found. */
  pass: boolean;
  /** All divergences found. */
  divergences: ArtifactDivergence[];
  /** Artifacts that could not be loaded (missing or invalid JSON). */
  missingArtifacts: string[];
}

/** A loaded artifact with its resolved path. */
interface LoadedArtifact {
  filePath: string;
  data: Record<string, unknown>;
}

/** Maximum allowed generatedAt drift in milliseconds (5 minutes). */
const MAX_GENERATED_AT_DRIFT_MS = 5 * 60 * 1000;

/**
 * Resolves the repo root by searching upward from __dirname for package.json.
 */
function resolveRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..');
}

const REPO_ROOT = resolveRepoRoot();

/** Default artifact paths relative to repo root. */
export const DEFAULT_ARTIFACT_PATHS: string[] = [
  'PULSE_CERTIFICATE.json',
  'PULSE_CLI_DIRECTIVE.json',
  'PULSE_ARTIFACT_INDEX.json',
  '.pulse/current/PULSE_AUTONOMY_PROOF.json',
  '.pulse/current/PULSE_AUTONOMY_STATE.json',
  '.pulse/current/PULSE_AGENT_ORCHESTRATION_STATE.json',
  '.pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json',
  '.pulse/current/PULSE_CONVERGENCE_PLAN.json',
  '.pulse/current/PULSE_PRODUCT_VISION.json',
];

/**
 * Load a single artifact JSON file with an informative error on failure.
 * Returns null when the file is missing or unparseable.
 */
export function loadArtifact(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(
      `PULSE cross-artifact: cannot read "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `PULSE cross-artifact: "${filePath}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Safely deep-get a dotted path from an object (e.g. "cycleProof.proven"). */
function deepGet(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Check consistency across all loaded PULSE artifacts.
 *
 * Fields compared:
 *   - status
 *   - humanReplacementStatus
 *   - authorityMode
 *   - advisoryOnly
 *   - automationEligible
 *   - score
 *   - blockingTier
 *   - productionAutonomyVerdict   (vs PROOF.verdicts.productionAutonomy)
 *   - zeroPromptProductionGuidanceVerdict  (vs PROOF.verdicts.zeroPromptProductionGuidance)
 *   - canDeclareComplete  (vs PROOF.verdicts.canDeclareComplete)
 *   - cycleProof.proven
 *   - generatedAt  (drift ≤ 5 minutes allowed)
 *
 * Numeric counters compared when present:
 *   - codacyHighCount
 *   - parityGapCount
 *   - phantomCount
 *   - missingAdaptersCount
 *   - staleAdaptersCount
 *   - invalidAdaptersCount
 */
export function checkConsistency(artifacts: LoadedArtifact[]): ConsistencyResult {
  if (artifacts.length === 0) {
    return { pass: true, divergences: [], missingArtifacts: [] };
  }

  const divergences: ArtifactDivergence[] = [];

  // ----------------------------------------------------------------
  // Helper: gather values for a field across all artifacts that define it
  // ----------------------------------------------------------------
  function gatherValues(
    fieldDotPath: string,
    aliasMap?: Record<string, string>,
  ): Array<{ filePath: string; value: unknown }> {
    return artifacts
      .map((a) => {
        let value = deepGet(a.data, fieldDotPath);
        // If this artifact didn't have the canonical field, try an alias
        if (value === undefined && aliasMap) {
          const alias = aliasMap[a.filePath] ?? aliasMap['*'];
          if (alias) {
            value = deepGet(a.data, alias);
          }
        }
        return { filePath: a.filePath, value };
      })
      .filter((x) => x.value !== undefined);
  }

  function addDivergenceIfNeeded(
    field: string,
    entries: Array<{ filePath: string; value: unknown }>,
  ): void {
    if (entries.length < 2) return;
    const unique = new Set(entries.map((e) => JSON.stringify(e.value)));
    if (unique.size > 1) {
      const values: Record<string, unknown> = {};
      for (const e of entries) {
        values[e.filePath] = e.value;
      }
      divergences.push({
        field,
        values,
        sources: entries.map((e) => e.filePath),
      });
    }
  }

  // ----------------------------------------------------------------
  // Certification-status fields
  // Only compare across artifacts that share the certification domain:
  //   PULSE_CERTIFICATE.json and PULSE_CONVERGENCE_PLAN.json.
  // PULSE_AUTONOMY_STATE and PULSE_AGENT_ORCHESTRATION_STATE use
  // `status` to mean orchestration-lifecycle ("idle"/"running"), which
  // is a different semantic and must NOT be compared against cert status.
  // ----------------------------------------------------------------
  const CERT_STATUS_ARTIFACTS = new Set([
    'PULSE_CERTIFICATE.json',
    '.pulse/current/PULSE_CONVERGENCE_PLAN.json',
  ]);

  function gatherCertValues(fieldDotPath: string): Array<{ filePath: string; value: unknown }> {
    return artifacts
      .filter((a) => {
        // Match by exact path or suffix so both absolute and relative paths work
        for (const allowed of CERT_STATUS_ARTIFACTS) {
          if (
            a.filePath === allowed ||
            a.filePath.endsWith('/' + allowed) ||
            a.filePath.endsWith(allowed.replace('/', path.sep))
          ) {
            return true;
          }
        }
        return false;
      })
      .map((a) => ({ filePath: a.filePath, value: deepGet(a.data, fieldDotPath) }))
      .filter((x) => x.value !== undefined);
  }

  addDivergenceIfNeeded('status', gatherCertValues('status'));
  addDivergenceIfNeeded('humanReplacementStatus', gatherCertValues('humanReplacementStatus'));
  addDivergenceIfNeeded('blockingTier', gatherCertValues('blockingTier'));

  // ----------------------------------------------------------------
  // Global scalar fields (shared semantics across all artifacts)
  // ----------------------------------------------------------------
  const globalScalarFields = ['authorityMode', 'advisoryOnly', 'automationEligible', 'score'];
  for (const field of globalScalarFields) {
    addDivergenceIfNeeded(field, gatherValues(field));
  }

  // ----------------------------------------------------------------
  // productionAutonomyVerdict
  // PULSE_CLI_DIRECTIVE has it at root; PULSE_AUTONOMY_PROOF has it at
  // productionAutonomyAnswer AND verdicts.productionAutonomy
  // ----------------------------------------------------------------
  {
    const entries: Array<{ filePath: string; value: unknown }> = [];
    for (const a of artifacts) {
      const rootVal = deepGet(a.data, 'productionAutonomyVerdict');
      const answerVal = deepGet(a.data, 'productionAutonomyAnswer');
      const verdictsVal = deepGet(a.data, 'verdicts.productionAutonomy');
      const val = rootVal ?? answerVal ?? verdictsVal;
      if (val !== undefined) {
        entries.push({ filePath: a.filePath, value: val });
      }
    }
    addDivergenceIfNeeded('productionAutonomyVerdict', entries);
  }

  // ----------------------------------------------------------------
  // zeroPromptProductionGuidanceVerdict
  // ----------------------------------------------------------------
  {
    const entries: Array<{ filePath: string; value: unknown }> = [];
    for (const a of artifacts) {
      const rootVal = deepGet(a.data, 'zeroPromptProductionGuidanceVerdict');
      const answerVal = deepGet(a.data, 'zeroPromptProductionGuidanceAnswer');
      const verdictsVal = deepGet(a.data, 'verdicts.zeroPromptProductionGuidance');
      const val = rootVal ?? answerVal ?? verdictsVal;
      if (val !== undefined) {
        entries.push({ filePath: a.filePath, value: val });
      }
    }
    addDivergenceIfNeeded('zeroPromptProductionGuidanceVerdict', entries);
  }

  // ----------------------------------------------------------------
  // canDeclareComplete
  // ----------------------------------------------------------------
  {
    const entries: Array<{ filePath: string; value: unknown }> = [];
    for (const a of artifacts) {
      const rootVal = deepGet(a.data, 'canDeclareComplete');
      const verdictsVal = deepGet(a.data, 'verdicts.canDeclareComplete');
      const val = rootVal ?? verdictsVal;
      if (val !== undefined) {
        entries.push({ filePath: a.filePath, value: val });
      }
    }
    addDivergenceIfNeeded('canDeclareComplete', entries);
  }

  // ----------------------------------------------------------------
  // cycleProof.proven
  // ----------------------------------------------------------------
  addDivergenceIfNeeded('cycleProof.proven', gatherValues('cycleProof.proven'));

  // ----------------------------------------------------------------
  // Numeric counters: codacyHighCount, parityGapCount, phantomCount,
  // missingAdaptersCount, staleAdaptersCount, invalidAdaptersCount
  // ----------------------------------------------------------------
  const counterFields = [
    'codacyHighCount',
    'parityGapCount',
    'phantomCount',
    'missingAdaptersCount',
    'staleAdaptersCount',
    'invalidAdaptersCount',
  ];
  for (const field of counterFields) {
    addDivergenceIfNeeded(field, gatherValues(field));
  }

  // ----------------------------------------------------------------
  // generatedAt: allow drift up to MAX_GENERATED_AT_DRIFT_MS
  // ----------------------------------------------------------------
  {
    const entries = gatherValues('generatedAt').filter(
      (e) => typeof e.value === 'string',
    ) as Array<{ filePath: string; value: string }>;

    if (entries.length >= 2) {
      const timestamps = entries.map((e) => new Date(e.value).getTime()).filter((t) => !isNaN(t));
      if (timestamps.length >= 2) {
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        if (maxTs - minTs > MAX_GENERATED_AT_DRIFT_MS) {
          const values: Record<string, unknown> = {};
          for (const e of entries) values[e.filePath] = e.value;
          divergences.push({
            field: 'generatedAt',
            values,
            sources: entries.map((e) => e.filePath),
          });
        }
      }
    }
  }

  return {
    pass: divergences.length === 0,
    divergences,
    missingArtifacts: [],
  };
}

/**
 * Load all default PULSE artifacts from the repo root and run the consistency check.
 * Resolves paths relative to the repo root unless an absolute path is provided.
 */
export function runCrossArtifactConsistencyCheck(repoRoot?: string): ConsistencyResult {
  const root = repoRoot ?? REPO_ROOT;
  const missingArtifacts: string[] = [];
  const loaded: LoadedArtifact[] = [];

  for (const rel of DEFAULT_ARTIFACT_PATHS) {
    const filePath = path.isAbsolute(rel) ? rel : path.join(root, rel);
    let data: Record<string, unknown> | null;
    try {
      data = loadArtifact(filePath);
    } catch (err) {
      // Invalid JSON — treat as missing but report
      missingArtifacts.push(filePath);
      continue;
    }
    if (data === null) {
      missingArtifacts.push(filePath);
    } else {
      loaded.push({ filePath, data });
    }
  }

  const result = checkConsistency(loaded);
  result.missingArtifacts = missingArtifacts;
  return result;
}

/** Format a ConsistencyResult for human-readable console output. */
export function formatConsistencyResult(result: ConsistencyResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=== PULSE Cross-Artifact Consistency Check ===');

  if (result.missingArtifacts.length > 0) {
    lines.push('');
    lines.push(`Missing artifacts (${result.missingArtifacts.length}):`);
    for (const a of result.missingArtifacts) {
      lines.push(`  - ${a}`);
    }
  }

  if (result.pass) {
    lines.push('');
    lines.push('PASS: All loaded artifacts are consistent.');
  } else {
    lines.push('');
    lines.push(`FAIL: ${result.divergences.length} divergence(s) found:`);
    for (const d of result.divergences) {
      lines.push('');
      lines.push(`  Field: ${d.field}`);
      for (const src of d.sources) {
        lines.push(`    ${src}: ${JSON.stringify(d.values[src])}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ----------------------------------------------------------------
// CLI entry point
// ----------------------------------------------------------------
if (require.main === module) {
  const result = runCrossArtifactConsistencyCheck();
  process.stdout.write(formatConsistencyResult(result));
  if (!result.pass) {
    process.exit(1);
  }
}
