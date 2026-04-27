import type {
  PulseScopeState,
  PulseScopeOrphanFile,
  PulseScopeFile,
  PulseStructuralGraph,
  PulseCapabilityState,
  PulseFlowProjection,
} from './types';

function filePathToModule(filePath: string): string {
  return filePath
    .replace(/\.(?:spec|test|e2e-spec|e2e)\.(?:ts|tsx|js|jsx)$/, '')
    .replace(/\.(?:ts|tsx|js|jsx)$/, '')
    .replace(/[\\/]/g, '-');
}

function isStructuralFile(file: PulseScopeFile): boolean {
  return (
    file.surface === 'backend' ||
    file.surface === 'frontend' ||
    file.surface === 'frontend-admin' ||
    file.surface === 'worker' ||
    file.kind === 'source' ||
    file.kind === 'spec' ||
    file.kind === 'migration'
  );
}
function isSourceFile(file: PulseScopeFile): boolean {
  return file.kind === 'source';
}

export interface CoverageInput {
  scopeState: PulseScopeState;
  structuralGraph?: PulseStructuralGraph;
  capabilityState?: PulseCapabilityState;
  flowProjection?: PulseFlowProjection;
  runtimeProbeCount?: number;
  runtimeProbeFreshCount?: number;
  runtimeProbeStaleCount?: number;
  scenarioCounts?: { declared: number; executed: number; passed: number };
}

export interface CoverageResult {
  structuralGraphCoverage: number;
  structuralGraphCoverageReason: string;
  connectedFilesCount: number;
  relevantStructuralFilesCount: number;
  orphanFiles: PulseScopeOrphanFile[];
  testCoverage: number;
  testCoverageReason: string;
  scenarioCoverage: number;
  declaredScenarioCoverage: number;
  executedScenarioCoverage: number;
  passedScenarioCoverage: number;
  scenarioCoverageReason: string;
  runtimeEvidenceCoverage: number;
  freshRuntimeEvidenceCoverage: number;
  staleRuntimeEvidenceCoverage: number;
  runtimeEvidenceCoverageReason: string;
  productionProofCoverage: number;
  productionProofCoverageReason: string;
}

export function calculateCoverage(input: CoverageInput): CoverageResult {
  const { scopeState, structuralGraph, capabilityState, flowProjection } = input;
  const relevantStructuralFiles = scopeState.files.filter(isStructuralFile);
  const relCount = relevantStructuralFiles.length;
  let connectedCount = 0;
  const connectedPaths = new Set<string>();
  if (structuralGraph?.nodes)
    for (const node of structuralGraph.nodes) {
      if (node.file && !connectedPaths.has(node.file)) connectedPaths.add(node.file);
    }
  const specMap = new Map<string, boolean>();
  for (const f of scopeState.files) {
    if (f.kind === 'spec') specMap.set(filePathToModule(f.path), true);
  }
  for (const f of relevantStructuralFiles) {
    if (connectedPaths.has(f.path)) connectedCount += 1;
    else if (f.kind === 'source' && specMap.has(filePathToModule(f.path))) connectedCount += 1;
  }
  const sgCoverage = relCount > 0 ? Math.round((connectedCount / relCount) * 100) : 0;
  const sgReason =
    relCount === 0
      ? 'No structural files in scope.'
      : connectedCount === 0 && structuralGraph?.nodes?.length
        ? `${structuralGraph.nodes.length} nodes exist but none match scope paths.`
        : connectedCount === 0
          ? 'Structural graph node file provenance unavailable.'
          : `${connectedCount}/${relCount} structural files connected.`;
  const orphans = relevantStructuralFiles
    .filter((f) => !connectedPaths.has(f.path))
    .slice(0, 200)
    .map((f) => ({
      path: f.path,
      lineCount: f.lineCount,
      surface: f.surface,
      kind: f.kind,
      reason:
        f.kind === 'spec'
          ? 'Spec file not linked to source module'
          : 'Not connected to structural graph node',
    }));

  const sourceFiles = scopeState.files.filter(isSourceFile);
  const srcModules = new Set(sourceFiles.map((f) => filePathToModule(f.path)));
  const specModules = new Set(
    scopeState.files.filter((f) => f.kind === 'spec').map((f) => filePathToModule(f.path)),
  );
  let srcWithSpecs = 0;
  for (const m of srcModules) {
    if (specModules.has(m)) srcWithSpecs += 1;
  }
  const testCov = srcModules.size > 0 ? Math.round((srcWithSpecs / srcModules.size) * 100) : 0;
  const testReason =
    srcModules.size === 0
      ? 'No source files in scope.'
      : srcWithSpecs === 0
        ? 'No source modules have associated spec files.'
        : `${srcWithSpecs}/${srcModules.size} source modules have spec files.`;

  let declared = input.scenarioCounts?.declared ?? 0;
  let executed = input.scenarioCounts?.executed ?? 0;
  let passed = input.scenarioCounts?.passed ?? 0;
  if (declared === 0 && flowProjection?.flows) {
    declared = flowProjection.flows.length;
    executed = flowProjection.flows.filter(
      (f) => f.status !== 'latent' && f.status !== 'phantom',
    ).length;
    passed = flowProjection.flows.filter((f) => f.status === 'real').length;
  }
  const scCov = declared > 0 ? Math.round((executed / declared) * 100) : 0;
  const scReason =
    declared === 0
      ? 'No scenarios declared.'
      : `${executed}/${declared} scenarios exercised, ${passed} passed.`;

  const totalProbes = input.runtimeProbeCount ?? 0;
  const fresh = input.runtimeProbeFreshCount ?? 0;
  const stale = input.runtimeProbeStaleCount ?? 0;
  const reCov = totalProbes > 0 ? Math.round((fresh / totalProbes) * 100) : 0;
  const reReason =
    totalProbes === 0 ? 'No runtime probes executed.' : `${fresh}/${totalProbes} probes fresh.`;

  let ppCov = 0;
  let ppReason = '';
  if (capabilityState?.capabilities) {
    const total = capabilityState.capabilities.length;
    const certified = capabilityState.capabilities.filter((c) => c.status === 'real').length;
    ppCov = total > 0 ? Math.round((certified / total) * 100) : 0;
    ppReason = `${certified}/${total} capabilities real.`;
  } else {
    ppReason = 'No capability state available.';
  }

  return {
    structuralGraphCoverage: sgCoverage,
    structuralGraphCoverageReason: sgReason,
    connectedFilesCount: connectedCount,
    relevantStructuralFilesCount: relCount,
    orphanFiles: orphans,
    testCoverage: testCov,
    testCoverageReason: testReason,
    scenarioCoverage: scCov,
    declaredScenarioCoverage: declared > 0 ? 100 : 0,
    executedScenarioCoverage: declared > 0 ? Math.round((executed / declared) * 100) : 0,
    passedScenarioCoverage: executed > 0 ? Math.round((passed / executed) * 100) : 0,
    scenarioCoverageReason: scReason,
    runtimeEvidenceCoverage: reCov,
    freshRuntimeEvidenceCoverage: reCov,
    staleRuntimeEvidenceCoverage: totalProbes > 0 ? Math.round((stale / totalProbes) * 100) : 0,
    runtimeEvidenceCoverageReason: reReason,
    productionProofCoverage: ppCov,
    productionProofCoverageReason: ppReason,
  };
}
