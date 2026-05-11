import type { PulseConfig } from '../../types.manifest';
import type { PulseStructuralGraph } from '../../types.structural';
import type { FullScanOptions } from './types';
import {
  PASSED,
  FAILED,
  safeRun,
  isFailedExecutionStatusFromEvidence,
  derivePerfectnessSummary,
} from './types';
import * as path from 'path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
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
import { buildReplayState } from '../../__parts__/replay-adapter/main';
import { buildProductionProofState } from '../../production-proof/__parts__/engine';
import { buildChaosCatalog } from '../../chaos-engine/__parts__/scenarios';
import { buildPathCoverageState } from '../../path-coverage-engine/__parts__/build-coverage-state';
import { writePulseCommandGraphArtifact } from '../../command-graph-artifact';
import { buildProofSynthesisState } from '../../proof-synthesis';
import { buildProbabilisticRisk } from '../../__parts__/probabilistic-risk/engine';
import { buildStructuralMemory } from '../../structural-memory/__parts__/memory-patterns';
import { buildFPAdjudicationState } from '../../false-positive-adjudicator';
import { evaluateAuthorityState } from '../../authority-engine/__parts__/api';
import { buildAuditChain } from '../../__parts__/audit-chain/main';
import { checkGitNexusFreshness } from '../../gitnexus-freshness';
import { loadPluginRegistry } from '../../__parts__/plugin-system/main';
import { buildSandboxState } from '../../safety-sandbox/__parts__/sandbox';
import { evaluatePerfectness } from '../../perfectness-test/__parts__/perfectness-eval';

interface PerfectnessModule {
  module: string;
  run: () => unknown | Promise<unknown>;
  tier0: boolean;
}

export async function runPerfectnessScan(
  config: PulseConfig,
  options: FullScanOptions,
  structuralGraph: PulseStructuralGraph,
): Promise<void> {
  const perfectnessStart = Date.now();

  const perfectnessModules: PerfectnessModule[] = [
    {
      module: 'ast-call-graph',
      run: () => buildAstCallGraph(config.rootDir),
      tier0: false,
    },
    {
      module: 'scope-engine',
      run: () => buildScopeEngineState(config.rootDir),
      tier0: false,
    },
    {
      module: 'behavior-graph',
      run: () => generateBehaviorGraph(config.rootDir),
      tier0: true,
    },
    {
      module: 'merkle-dag',
      run: () => buildMerkleDag(config.rootDir, structuralGraph),
      tier0: false,
    },
    {
      module: 'otel-runtime',
      run: () => collectRuntimeTraces(config.rootDir),
      tier0: false,
    },
    {
      module: 'runtime-fusion',
      run: () => buildRuntimeFusionState(config.rootDir),
      tier0: false,
    },
    {
      module: 'property-tester',
      run: () => buildPropertyTestEvidence(config.rootDir),
      tier0: false,
    },
    {
      module: 'execution-harness',
      run: () => buildExecutionHarness(config.rootDir),
      tier0: false,
    },
    {
      module: 'ui-crawler',
      run: () => buildUICrawlerCatalog(config.rootDir),
      tier0: false,
    },
    {
      module: 'api-fuzzer',
      run: () => buildAPIFuzzCatalog(config.rootDir),
      tier0: false,
    },
    {
      module: 'dataflow-engine',
      run: () => buildDataflowState(config.rootDir),
      tier0: false,
    },
    {
      module: 'contract-tester',
      run: () => buildContractTestEvidence(config.rootDir),
      tier0: false,
    },
    {
      module: 'dod-engine',
      run: () => buildDoDEngineState(config.rootDir),
      tier0: false,
    },
    {
      module: 'observability-coverage',
      run: () => buildObservabilityCoverage(config.rootDir),
      tier0: false,
    },
    {
      module: 'scenario-engine',
      run: () => buildScenarioCatalog(config.rootDir),
      tier0: false,
    },
    {
      module: 'replay-adapter',
      run: () => buildReplayState(config.rootDir),
      tier0: true,
    },
    {
      module: 'production-proof',
      run: () => buildProductionProofState(config.rootDir),
      tier0: true,
    },
    {
      module: 'chaos-engine',
      run: () => buildChaosCatalog(config.rootDir),
      tier0: false,
    },
    {
      module: 'path-coverage-engine',
      run: () => buildPathCoverageState(config.rootDir),
      tier0: true,
    },
    {
      module: 'probabilistic-risk',
      run: () => buildProbabilisticRisk(config.rootDir),
      tier0: true,
    },
    {
      module: 'structural-memory',
      run: () => buildStructuralMemory(config.rootDir),
      tier0: true,
    },
    {
      module: 'false-positive-adjudicator',
      run: () => buildFPAdjudicationState(config.rootDir),
      tier0: true,
    },
    {
      module: 'authority-engine',
      run: () => evaluateAuthorityState(config.rootDir),
      tier0: false,
    },
    {
      module: 'audit-chain',
      run: () => buildAuditChain(config.rootDir),
      tier0: true,
    },
    {
      module: 'gitnexus-freshness',
      run: () => checkGitNexusFreshness(config.rootDir),
      tier0: true,
    },
    {
      module: 'plugin-system',
      run: () => loadPluginRegistry(config.rootDir),
      tier0: true,
    },
    {
      module: 'safety-sandbox',
      run: () => buildSandboxState(config.rootDir),
      tier0: true,
    },
    {
      module: 'perfectness-test',
      run: () => evaluatePerfectness(config.rootDir, new Date().toISOString()),
      tier0: true,
    },
  ];
  const selectedPerfectnessModules =
    options.perfectnessMode === 'tier0'
      ? perfectnessModules.filter((moduleRun) => moduleRun.tier0)
      : perfectnessModules;
  options.tracer?.startPhase('scan:perfectness', {
    moduleCount: selectedPerfectnessModules.length + 2,
    tier0Mode: options.perfectnessMode === 'tier0',
  });

  const perfectnessRuns = await Promise.all(
    selectedPerfectnessModules.map((moduleRun) => safeRun(moduleRun.module, moduleRun.run)),
  );

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
