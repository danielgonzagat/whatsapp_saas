import * as path from 'path';
import type { ArtifactDivergence, ConsistencyResult, LoadedArtifact } from './types';
import { deepGet, MAX_GENERATED_AT_DRIFT_MS } from './loaders';

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
