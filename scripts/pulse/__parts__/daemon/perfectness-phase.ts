import * as path from 'path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { buildAstCallGraph } from '../../ast-graph';
import { buildScopeEngineState } from '../../scope-engine';
import { generateBehaviorGraph } from '../../behavior-graph';
import { buildMerkleDag } from '../../merkle-cache';
import { collectRuntimeTraces } from '../../otel-runtime';
import { buildRuntimeFusionState } from '../../runtime-fusion';
import { buildPropertyTestEvidence } from '../../property-tester';
import { buildExecutionHarness } from '../../execution-harness';
import { buildUICrawlerCatalog } from '../../ui-crawler';
import { buildAPIFuzzCatalog } from '../../api-fuzzer';
import { buildDataflowState } from '../../dataflow-engine';
import { buildContractTestEvidence } from '../../contract-tester';
import { buildDoDEngineState } from '../../dod-engine';
import { buildObservabilityCoverage } from '../../observability-coverage';
import { buildScenarioCatalog } from '../../scenario-engine';
import { buildReplayState } from '../../replay-adapter';
import { buildProductionProofState } from '../../production-proof';
import { buildChaosCatalog } from '../../chaos-engine';
import { buildPathCoverageState } from '../../path-coverage-engine';
import { writePulseCommandGraphArtifact } from '../../command-graph-artifact';
import { buildProofSynthesisState } from '../../proof-synthesis';
import { buildProbabilisticRisk } from '../../probabilistic-risk';
import { buildStructuralMemory } from '../../structural-memory';
import { buildFPAdjudicationState } from '../../false-positive-adjudicator';
import { evaluateAuthorityState } from '../../authority-engine';
import { buildAuditChain } from '../../audit-chain';
import { checkGitNexusFreshness } from '../../gitnexus-freshness';
import { loadPluginRegistry } from '../../plugin-system';
import { buildSandboxState } from '../../safety-sandbox';
import { evaluatePerfectness } from '../../perfectness-test';

import type { PulseConfig, PulseStructuralGraph } from '../../types';
import type { PulseExecutionTracer } from '../../execution-trace';
import { safeRun } from './infra';

export async function runPerfectnessPhase(
  config: PulseConfig,
  structuralGraph: PulseStructuralGraph,
  tracer?: PulseExecutionTracer,
): Promise<void> {
  const perfectnessStart = Date.now();

  tracer?.startPhase('scan:perfectness', {
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
  const failedAllPerfectnessRuns = allPerfectnessRuns.filter((run) => run.status === 'failed');
  const perfectnessArtifactDir = path.join(config.rootDir, '.pulse', 'current');
  ensureDir(perfectnessArtifactDir, { recursive: true });
  writeTextFile(
    path.join(perfectnessArtifactDir, 'PULSE_PERFECTNESS_LAYER_STATE.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: failedAllPerfectnessRuns.length === 0 ? 'pass' : 'partial',
        moduleCount: allPerfectnessRuns.length,
        passedModules: allPerfectnessRuns.length - failedAllPerfectnessRuns.length,
        failedModules: failedAllPerfectnessRuns.length,
        runs: allPerfectnessRuns,
      },
      null,
      2,
    ),
  );

  tracer?.finishPhase(
    'scan:perfectness',
    failedAllPerfectnessRuns.length === 0 ? 'passed' : 'failed',
    {
      errorSummary:
        failedAllPerfectnessRuns.length === 0
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
