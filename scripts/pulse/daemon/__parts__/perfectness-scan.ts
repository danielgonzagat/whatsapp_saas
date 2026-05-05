import type { PulseConfig, PulseStructuralGraph } from '../../types';
import type { FullScanOptions } from './types';
import { PASSED, FAILED, safeRun, isFailedExecutionStatusFromEvidence } from './types';
import * as path from 'path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { deriveZeroValue } from '../../dynamic-reality-kernel';
import { buildAstCallGraph } from '../../ast-graph/__parts__/call-graph';
import { buildScopeEngineState } from '../../__parts__/scope-engine/engine';
import { generateBehaviorGraph } from '../../behavior-graph/__parts__/graph-builder';
import { buildMerkleDag } from '../../merkle-cache/__parts__/dag-build';
import { collectRuntimeTraces } from '../../otel-runtime/__parts__/collection';
import { buildRuntimeFusionState } from '../../runtime-fusion/__parts__/builder';
import { buildPropertyTestEvidence } from '../../property-tester/__parts__/build-evidence';
import { buildExecutionHarness } from '../../execution-harness-core/__parts__/harness-build';
import { buildUICrawlerCatalog } from '../../__parts__/ui-crawler/catalog';
import { buildAPIFuzzCatalog } from '../../api-fuzzer/__parts__/fuzzer';
import { buildDataflowState } from '../../dataflow-engine/__parts__/builder';
import { buildContractTestEvidence } from '../../contract-tester/__parts__/part2_main';
import { buildDoDEngineState } from '../../dod-engine';
import { buildObservabilityCoverage } from '../../observability-coverage/__parts__/builder';
import { buildScenarioCatalog } from '../../scenario-engine/__parts__/builder/__parts__/core';
import { buildReplayState } from '../../replay-adapter';
import { buildProductionProofState } from '../../production-proof';
import { buildChaosCatalog } from '../../chaos-engine/__parts__/scenarios';
import { buildPathCoverageState } from '../../path-coverage-engine/__parts__/build-coverage-state';
import { writePulseCommandGraphArtifact } from '../../command-graph-artifact';
import { buildProofSynthesisState } from '../../proof-synthesis';
import { buildProbabilisticRisk } from '../../probabilistic-risk';
import { buildStructuralMemory } from '../../structural-memory/__parts__/memory-patterns';
import { buildFPAdjudicationState } from '../../false-positive-adjudicator';
import { evaluateAuthorityState } from '../../authority-engine/__parts__/api';
import { buildAuditChain } from '../../audit-chain';
import { checkGitNexusFreshness } from '../../gitnexus-freshness';
import { loadPluginRegistry } from '../../plugin-system';
import { buildSandboxState } from '../../safety-sandbox/__parts__/sandbox';
import { evaluatePerfectness } from '../../perfectness-test/__parts__/perfectness-eval';

export async function runPerfectnessScan(
  config: PulseConfig,
  options: FullScanOptions,
  structuralGraph: PulseStructuralGraph,
): Promise<void> {
  const perfectnessStart = Date.now();

  options.tracer?.startPhase('scan:perfectness', {
    moduleCount: 28,
  });

  const perfectnessRuns = await Promise.all([
    safeRun('ast-call-graph', () => buildAstCallGraph(config.rootDir)),
    safeRun('scope-engine', () => buildScopeEngineState(config.rootDir)),
    safeRun('behavior-graph', () => generateBehaviorGraph(config.rootDir)),
    safeRun('merkle-dag', () => buildMerkleDag(config.rootDir, structuralGraph)),
    safeRun('otel-runtime', () => collectRuntimeTraces(config.rootDir)),
    safeRun('runtime-fusion', () => buildRuntimeFusionState(config.rootDir)),
    safeRun('property-tester', () => buildPropertyTestEvidence(config.rootDir)),
    safeRun('execution-harness', () => buildExecutionHarness(config.rootDir)),
    safeRun('ui-crawler', () => buildUICrawlerCatalog(config.rootDir)),
    safeRun('api-fuzzer', () => buildAPIFuzzCatalog(config.rootDir)),
    safeRun('dataflow-engine', () => buildDataflowState(config.rootDir)),
    safeRun('contract-tester', () => buildContractTestEvidence(config.rootDir)),
    safeRun('dod-engine', () => buildDoDEngineState(config.rootDir)),
    safeRun('observability-coverage', () => buildObservabilityCoverage(config.rootDir)),
    safeRun('scenario-engine', () => buildScenarioCatalog(config.rootDir)),
    safeRun('replay-adapter', () => buildReplayState(config.rootDir)),
    safeRun('production-proof', () => buildProductionProofState(config.rootDir)),
    safeRun('chaos-engine', () => buildChaosCatalog(config.rootDir)),
    safeRun('path-coverage-engine', () => buildPathCoverageState(config.rootDir)),
    safeRun('probabilistic-risk', () => buildProbabilisticRisk(config.rootDir)),
    safeRun('structural-memory', () => buildStructuralMemory(config.rootDir)),
    safeRun('false-positive-adjudicator', () => buildFPAdjudicationState(config.rootDir)),
    safeRun('authority-engine', () => evaluateAuthorityState(config.rootDir)),
    safeRun('audit-chain', () => buildAuditChain(config.rootDir)),
    safeRun('gitnexus-freshness', () => checkGitNexusFreshness(config.rootDir)),
    safeRun('plugin-system', () => loadPluginRegistry(config.rootDir)),
    safeRun('safety-sandbox', () => buildSandboxState(config.rootDir)),
    safeRun('perfectness-test', () =>
      evaluatePerfectness(config.rootDir, new Date().toISOString()),
    ),
  ]);

  const proofSynthesisRun = await safeRun('proof-synthesis', () =>
    buildProofSynthesisState(config.rootDir),
  );
  const commandGraphRun = await safeRun('command-graph', () =>
    writePulseCommandGraphArtifact(config.rootDir),
  );
  const allPerfectnessRuns = [...perfectnessRuns, proofSynthesisRun, commandGraphRun];
  const failedAllPerfectnessRuns = allPerfectnessRuns.filter((run) =>
    isFailedExecutionStatusFromEvidence(run.status),
  );
  const perfectnessArtifactDir = path.join(config.rootDir, '.pulse', 'current');
  ensureDir(perfectnessArtifactDir, { recursive: true });
  writeTextFile(
    path.join(perfectnessArtifactDir, 'PULSE_PERFECTNESS_LAYER_STATE.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: failedAllPerfectnessRuns.length === deriveZeroValue() ? 'pass' : 'partial',
        moduleCount: allPerfectnessRuns.length,
        passedModules: allPerfectnessRuns.length - failedAllPerfectnessRuns.length,
        failedModules: failedAllPerfectnessRuns.length,
        runs: allPerfectnessRuns,
      },
      null,
      2,
    ),
  );

  options.tracer?.finishPhase(
    'scan:perfectness',
    failedAllPerfectnessRuns.length === deriveZeroValue() ? PASSED : FAILED,
    {
      errorSummary:
        failedAllPerfectnessRuns.length === deriveZeroValue()
          ? undefined
          : `${failedAllPerfectnessRuns.length} perfectness module(s) failed`,
      metadata: {
        durationMs: Date.now() - perfectnessStart,
        moduleCount: allPerfectnessRuns.length,
        failedModules: failedAllPerfectnessRuns.length,
      },
    },
  );
}
