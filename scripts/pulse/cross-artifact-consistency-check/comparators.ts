import * as path from 'path';
import type { ArtifactDivergence, ConsistencyResult, LoadedArtifact } from './types';
import { deepGet, MAX_GENERATED_AT_DRIFT_MS } from './loaders';

interface DirectiveUnitView {
  id?: string;
  kind?: string;
  source?: string;
  executionMode?: string;
  productImpact?: string;
  ownerLane?: string;
  title?: string;
  relatedFiles: string[];
  ownedFiles: string[];
  validationTargets: string[];
  validationArtifacts: string[];
}

interface ProofDebtSignal {
  source: string;
  field: string;
  value: unknown;
}

const MACHINE_ARTIFACT_PATTERN =
  /(^|\/|\\)(\.pulse($|\/|\\)|PULSE_[^/\\]+\.json$|pulse\.manifest\.json$)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function getDirectiveUnitArray(artifact: LoadedArtifact, field: string): DirectiveUnitView[] {
  const rawUnits = deepGet(artifact.data, field);
  if (!Array.isArray(rawUnits)) {
    return [];
  }

  return rawUnits.filter(isRecord).map((unit) => ({
    id: asString(unit.id),
    kind: asString(unit.kind),
    source: asString(unit.source),
    executionMode: asString(unit.executionMode),
    productImpact: asString(unit.productImpact),
    ownerLane: asString(unit.ownerLane),
    title: asString(unit.title),
    relatedFiles: asStringArray(unit.relatedFiles),
    ownedFiles: asStringArray(unit.ownedFiles),
    validationTargets: asStringArray(unit.validationTargets),
    validationArtifacts: asStringArray(unit.validationArtifacts),
  }));
}

function normalizePathForCheck(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isMachineEvidencePath(filePath: string): boolean {
  const normalized = normalizePathForCheck(filePath);
  return (
    normalized.startsWith('scripts/pulse/') ||
    normalized === 'scripts/pulse' ||
    MACHINE_ARTIFACT_PATTERN.test(normalized)
  );
}

function getUnitProductFiles(unit: DirectiveUnitView): string[] {
  return [...unit.relatedFiles, ...unit.ownedFiles].filter((filePath) => {
    const normalized = normalizePathForCheck(filePath);
    return normalized.length > 0 && !isMachineEvidencePath(normalized);
  });
}

function isPulseMachineUnit(unit: DirectiveUnitView): boolean {
  const kind = String(unit.kind || '').toLowerCase();
  const source = String(unit.source || '').toLowerCase();
  const productImpact = String(unit.productImpact || '').toLowerCase();
  const ownerLane = String(unit.ownerLane || '').toLowerCase();
  const files = [...unit.relatedFiles, ...unit.ownedFiles];
  const hasOnlyMachineFiles = files.length > 0 && files.every(isMachineEvidencePath);

  return (
    kind === 'pulse_machine' ||
    source === 'pulse_machine' ||
    productImpact === 'machine' ||
    ownerLane.startsWith('pulse') ||
    hasOnlyMachineFiles
  );
}

function isProductPrioritizedUnit(unit: DirectiveUnitView): boolean {
  if (isPulseMachineUnit(unit)) {
    return false;
  }

  if (String(unit.productImpact || '').toLowerCase() === 'machine') {
    return false;
  }

  return getUnitProductFiles(unit).length > 0;
}

function firstExecutableUnit(units: DirectiveUnitView[]): DirectiveUnitView | undefined {
  return units.find((unit) => {
    const mode = String(unit.executionMode || '').toLowerCase();
    return mode === '' || mode === 'ai_safe' || mode === 'governed_sandbox';
  });
}

function addProofDebtSignal(
  signals: ProofDebtSignal[],
  source: string,
  field: string,
  value: unknown,
): void {
  if (value === 'NAO' || value === false || value === 'missing_evidence') {
    signals.push({ source, field, value });
  }
}

function collectMissingEvidenceGateSignals(
  signals: ProofDebtSignal[],
  source: string,
  value: unknown,
  prefix: string,
): void {
  if (!isRecord(value)) {
    return;
  }

  const status = value.status;
  const failureClass = value.failureClass;
  if (status === 'fail' && failureClass === 'missing_evidence') {
    signals.push({ source, field: prefix, value: failureClass });
  }

  for (const [key, child] of Object.entries(value)) {
    if (isRecord(child)) {
      collectMissingEvidenceGateSignals(signals, source, child, `${prefix}.${key}`);
    }
  }
}

function collectProofDebtSignals(artifacts: LoadedArtifact[]): ProofDebtSignal[] {
  const signals: ProofDebtSignal[] = [];

  for (const artifact of artifacts) {
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'productionAutonomyVerdict',
      deepGet(artifact.data, 'productionAutonomyVerdict') ??
        deepGet(artifact.data, 'productionAutonomyAnswer') ??
        deepGet(artifact.data, 'verdicts.productionAutonomy'),
    );
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'zeroPromptProductionGuidanceVerdict',
      deepGet(artifact.data, 'zeroPromptProductionGuidanceVerdict') ??
        deepGet(artifact.data, 'zeroPromptProductionGuidanceAnswer') ??
        deepGet(artifact.data, 'verdicts.zeroPromptProductionGuidance'),
    );
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'canDeclareComplete',
      deepGet(artifact.data, 'canDeclareComplete') ??
        deepGet(artifact.data, 'verdicts.canDeclareComplete'),
    );
    collectMissingEvidenceGateSignals(
      signals,
      artifact.filePath,
      deepGet(artifact.data, 'gates'),
      'gates',
    );
  }

  return signals;
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
 *   - runId  (must be identical or explicitly marked as preserved)
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
  // Queue/blocker fields mirrored by directive, certificate, and plan artifacts.
  // ----------------------------------------------------------------
  addDivergenceIfNeeded('dynamicBlockingReasons', gatherValues('dynamicBlockingReasons'));
  addDivergenceIfNeeded('nextWork.queue', gatherValues('nextWork.queue'));

  // ----------------------------------------------------------------
  // Proof-debt drift guard:
  // next-step autonomy can remain valid while final production autonomy is
  // still unproven. During that state the directive must keep the first
  // executable unit on PULSE machine/proof work instead of drifting into
  // product-file materialization.
  // ----------------------------------------------------------------
  {
    const cli = artifacts.find((artifact) =>
      artifact.filePath.endsWith('PULSE_CLI_DIRECTIVE.json'),
    );
    const proofDebtSignals = collectProofDebtSignals(artifacts);
    if (cli && proofDebtSignals.length > 0) {
      const prioritizedUnit = firstExecutableUnit(
        getDirectiveUnitArray(cli, 'nextExecutableUnits'),
      );
      if (prioritizedUnit && isProductPrioritizedUnit(prioritizedUnit)) {
        const sources = uniqueSources([
          cli.filePath,
          ...proofDebtSignals.map((signal) => signal.source),
        ]);
        const values: Record<string, unknown> = {};
        for (const source of sources) {
          values[source] =
            source === cli.filePath
              ? {
                  authorityMode: deepGet(cli.data, 'authorityMode'),
                  canWorkNow: deepGet(cli.data, 'autonomyReadiness.canWorkNow'),
                  prioritizedUnitId: prioritizedUnit.id,
                  prioritizedUnitTitle: prioritizedUnit.title,
                  prioritizedUnitKind: prioritizedUnit.kind,
                  prioritizedUnitSource: prioritizedUnit.source,
                  productFiles: getUnitProductFiles(prioritizedUnit),
                  proofDebtSignals,
                }
              : proofDebtSignals.filter((signal) => signal.source === source);
        }

        divergences.push({
          field: 'nextExecutableUnits.proofDebtDrift',
          values,
          sources,
        });
      }
    }
  }

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
  function addTimestampDivergenceIfNeeded(field: string): void {
    const entries = gatherValues(field).filter((e) => typeof e.value === 'string') as Array<{
      filePath: string;
      value: string;
    }>;

    if (entries.length >= 2) {
      const timestamps = entries.map((e) => new Date(e.value).getTime()).filter((t) => !isNaN(t));
      if (timestamps.length >= 2) {
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        if (maxTs - minTs > MAX_GENERATED_AT_DRIFT_MS) {
          const values: Record<string, unknown> = {};
          for (const e of entries) values[e.filePath] = e.value;
          divergences.push({
            field,
            values,
            sources: entries.map((e) => e.filePath),
          });
        }
      }
    }
  }

  addTimestampDivergenceIfNeeded('generatedAt');
  addTimestampDivergenceIfNeeded('timestamp');

  // ----------------------------------------------------------------
  // runId: must be identical or explicitly marked as preserved.
  // Artifacts with preservedFromPreviousRun: true are excluded
  // from runId comparison (their runId is expected to differ).
  // ----------------------------------------------------------------
  {
    // Gather artifacts that carry runId and are NOT explicitly preserved.
    // Also exclude artifacts with originalRunId (prior-run provenance even
    // if preservedFromPreviousRun flag is missing).
    const activeEntries = artifacts
      .filter((a) => {
        const preserved = deepGet(a.data, 'preservedFromPreviousRun');
        const hasOriginalRunId = deepGet(a.data, 'originalRunId') !== undefined;
        return preserved !== true && !hasOriginalRunId;
      })
      .map((a) => ({
        filePath: a.filePath,
        value: deepGet(a.data, 'runId'),
      }))
      .filter((e) => typeof e.value === 'string');

    if (activeEntries.length >= 2) {
      const uniqueRunIds = new Set(activeEntries.map((e) => e.value));
      if (uniqueRunIds.size > 1) {
        const values: Record<string, unknown> = {};
        for (const e of activeEntries) values[e.filePath] = e.value;
        divergences.push({
          field: 'runId',
          values,
          sources: activeEntries.map((e) => e.filePath),
        });
      }
    }
  }

  return {
    pass: divergences.length === 0,
    divergences,
    missingArtifacts: [],
  };
}

function uniqueSources(values: string[]): string[] {
  return [...new Set(values)];
}
