import { buildArtifactRegistry } from '../../artifact-registry/__parts__/registry';
import { buildCodacySummary, normalizePath } from '../../scope-state.codacy';
import { isUnknownFile } from '../../scope-state.classify';
import type {
  PulseScopeFile,
  PulseScopeExcludedFile,
  PulseScopeState,
  PulseScopeSurface,
} from '../../types.truth.scope';
import {
  createKindCountRecord,
  createSurfaceCountRecord,
  loadGovernanceBoundary,
  walkScopeFiles,
} from './walk-utils';

/**
 * Build the full filesystem-scope inventory for the repository.
 *
 * This function walks the entire repo directory tree recursively. Every file
 * that passes `isScannableFile()` is included in the scope — the function
 * does NOT consult or delegate to `pulse.manifest.json` for inclusion
 * decisions.
 *
 * **Manifest is a semantic overlay, NOT a scope boundary.**
 * `pulse.manifest.json` may tag files with metadata (lane, criticality,
 * user-facing flags, etc.) and it is loaded and used downstream in
 * certification / convergence-plan / reporting stages. However, the manifest
 * NEVER filters which files appear in the scope inventory. The scope is the
 * complete inventory; the manifest adds semantics on top of it.
 *
 * The ONLY file-level inclusion/exclusion filters applied here are:
 * - `SCANNABLE_EXTENSIONS` — file extensions considered source/config/doc.
 * - `IGNORED_DIRECTORIES` — directory names skipped during traversal
 *   (e.g. `node_modules`, `.git`, `dist`).
 * - Hard-coded path-prefix guards for non-repo artifacts (`.pulse/`,
 *   `.claude/`, `.copilot/`, and generated PULSE report files unless
 *   they match an observed artifact path).
 *
 * Governance-boundary protection (`scripts/ops/`, `.github/workflows/`,
 * etc.) is applied AFTER inclusion — it sets `executionMode` to
 * `observation_only` but does NOT exclude the file.
 */
export function buildScopeState(rootDir: string): PulseScopeState {
  const codacy = buildCodacySummary(rootDir);
  const boundary = loadGovernanceBoundary(rootDir);
  const artifactRegistry = buildArtifactRegistry(rootDir);
  const mirroredArtifacts = new Set(artifactRegistry.mirrors.map(normalizePath));
  const observedGeneratedArtifactPaths = new Set(
    codacy.observedFiles.filter((filePath) => mirroredArtifacts.has(filePath)),
  );
  const files: PulseScopeFile[] = [];
  const excludedFiles: PulseScopeExcludedFile[] = [];
  walkScopeFiles(
    rootDir,
    rootDir,
    boundary,
    codacy,
    observedGeneratedArtifactPaths,
    files,
    excludedFiles,
  );

  const fileMap = new Map(files.map((entry) => [entry.path, entry] as const));
  const surfaceCounts = createSurfaceCountRecord();
  const kindCounts = createKindCountRecord();

  let totalLines = 0;
  let runtimeCriticalFiles = 0;
  let userFacingFiles = 0;
  const humanRequiredFiles = 0;

  for (const file of files) {
    surfaceCounts[file.surface] += 1;
    kindCounts[file.kind] += 1;
    totalLines += file.lineCount;
    if (file.runtimeCritical) {
      runtimeCriticalFiles += 1;
    }
    if (file.userFacing) {
      userFacingFiles += 1;
    }
  }

  const moduleAggregateMap = new Map<
    string,
    {
      moduleKey: string;
      fileCount: number;
      runtimeCriticalFileCount: number;
      userFacingFileCount: number;
      humanRequiredFileCount: number;
      observedCodacyIssueCount: number;
      highSeverityIssueCount: number;
      surfaces: Set<PulseScopeSurface>;
    }
  >();

  for (const file of files) {
    if (!file.moduleCandidate) {
      continue;
    }
    if (!moduleAggregateMap.has(file.moduleCandidate)) {
      moduleAggregateMap.set(file.moduleCandidate, {
        moduleKey: file.moduleCandidate,
        fileCount: 0,
        runtimeCriticalFileCount: 0,
        userFacingFileCount: 0,
        humanRequiredFileCount: 0,
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        surfaces: new Set<PulseScopeSurface>(),
      });
    }

    const aggregate = moduleAggregateMap.get(file.moduleCandidate)!;
    aggregate.fileCount += 1;
    aggregate.runtimeCriticalFileCount += file.runtimeCritical ? 1 : 0;
    aggregate.userFacingFileCount += file.userFacing ? 1 : 0;
    aggregate.observedCodacyIssueCount += file.observedCodacyIssueCount;
    aggregate.highSeverityIssueCount += file.highSeverityIssueCount;
    aggregate.surfaces.add(file.surface);
  }

  const moduleAggregates = [...moduleAggregateMap.values()]
    .map((aggregate) => ({
      moduleKey: aggregate.moduleKey,
      fileCount: aggregate.fileCount,
      runtimeCriticalFileCount: aggregate.runtimeCriticalFileCount,
      userFacingFileCount: aggregate.userFacingFileCount,
      humanRequiredFileCount: aggregate.humanRequiredFileCount,
      observedCodacyIssueCount: aggregate.observedCodacyIssueCount,
      highSeverityIssueCount: aggregate.highSeverityIssueCount,
      surfaces: [...aggregate.surfaces].sort(),
    }))
    .sort((left, right) => left.moduleKey.localeCompare(right.moduleKey));

  const missingCodacyFiles = codacy.observedFiles.filter((filePath) => !fileMap.has(filePath));
  const parityConfidence = !codacy.snapshotAvailable
    ? 'low'
    : missingCodacyFiles.length > 0
      ? 'low'
      : codacy.stale
        ? 'medium'
        : 'high';

  const summaryReason =
    missingCodacyFiles.length > 0
      ? `Observed Codacy files are missing from repo inventory: ${missingCodacyFiles.join(', ')}.`
      : !codacy.snapshotAvailable
        ? 'Repo inventory completed, but Codacy snapshot is unavailable for cross-check.'
        : codacy.stale
          ? 'Repo inventory completed and observed Codacy files are covered, but the Codacy snapshot is stale.'
          : 'Repo inventory completed and all observed Codacy hotspot files are covered.';

  const unknownFiles = files.filter((file) => isUnknownFile(file.surface, file.kind));

  const classifiedFileCount = files.length - unknownFiles.length;
  const classificationCoverage =
    files.length > 0 ? Math.round((classifiedFileCount / files.length) * 100) : 0;

  const inventoryCoverage = files.length > 0 ? 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    summary: {
      totalFiles: files.length,
      totalLines,
      runtimeCriticalFiles,
      userFacingFiles,
      humanRequiredFiles,
      surfaceCounts,
      kindCounts,
      unmappedModuleCandidates: moduleAggregates
        .filter((aggregate) => aggregate.fileCount < 2)
        .map((aggregate) => aggregate.moduleKey)
        .sort(),
      inventoryCoverage,
      classificationCoverage,
      structuralGraphCoverage: 0,
      // Coverage metrics that require data from later pipeline stages.
      // Reported honestly as 0 until computation is wired.
      testCoverage: 0,
      scenarioCoverage: 0,
      runtimeEvidenceCoverage: 0,
      productionProofCoverage: 0,
      orphanFiles: [],
      unknownFiles,
    },
    parity: {
      status: missingCodacyFiles.length === 0 ? 'pass' : 'fail',
      mode: 'repo_inventory_with_codacy_spotcheck',
      confidence: parityConfidence,
      reason: summaryReason,
      inventoryFiles: files.length,
      codacyObservedFiles: codacy.observedFiles.length,
      codacyObservedFilesCovered: codacy.observedFiles.length - missingCodacyFiles.length,
      missingCodacyFiles,
    },
    codacy,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    moduleAggregates,
    excludedFiles: excludedFiles.sort((left, right) => left.path.localeCompare(right.path)),
    scopeSource: 'repo_filesystem',
    manifestBoundary: false,
    manifestRole: 'semantic_overlay',
  };
}
