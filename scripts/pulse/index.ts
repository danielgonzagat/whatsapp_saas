#!/usr/bin/env ts-node
/**
 * PULSE — Live Codebase Nervous System
 *
 * Maps the complete structure of a full-stack web application and finds
 * every disconnection between layers: UI → API → Backend → Database
 *
 * Usage:
 *   npx ts-node scripts/pulse/index.ts              # SCAN mode (static analysis, <5s)
 *   npx ts-node scripts/pulse/index.ts --deep       # DEEP mode (SCAN + runtime tests against Railway)
 *   npx ts-node scripts/pulse/index.ts --total      # TOTAL mode (DEEP + chaos/edge cases)
 *   npx ts-node scripts/pulse/index.ts --watch       # Daemon mode (live)
 *   npx ts-node scripts/pulse/index.ts --report      # Generate PULSE_REPORT.md
 *   npx ts-node scripts/pulse/index.ts --json        # JSON output
 *   npx ts-node scripts/pulse/index.ts --guidance    # Print dynamic CLI directive JSON
 *   npx ts-node scripts/pulse/index.ts --prove       # Print autonomy proof verdict JSON
 *   npx ts-node scripts/pulse/index.ts --vision      # Print dynamic product vision JSON
 *   npx ts-node scripts/pulse/index.ts --autonomous  # Run the autonomous Pulse -> Codex loop
 *   npx ts-node scripts/pulse/index.ts --autonomous --parallel-agents 3  # Run manager + workers
 *   npx ts-node scripts/pulse/index.ts --autonomous --risk-profile dangerous  # Expand ai_safe blast radius
 *   npx ts-node scripts/pulse/index.ts --verbose     # Show all breaks (including low severity)
 *   npx ts-node scripts/pulse/index.ts --fmap        # Generate FUNCTIONAL_MAP.md (page-by-page interaction trace)
 *   npx ts-node scripts/pulse/index.ts --customer    # Run customer synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --operator    # Run operator synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --admin       # Run admin synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --shift       # Run shift-time synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --soak        # Run soak-time synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --certify --tier 0  # Certify tier 0 hard gates
 *   npx ts-node scripts/pulse/index.ts --certify --final   # Run final certification target
 */

import { detectConfig } from './config';
import { fullScan, startDaemon } from './daemon';
import { computeCertification } from './certification';
import { buildStructuralGraph } from './structural-graph';
import { buildExecutionChains } from './execution-chains';
import { buildExecutionMatrix } from './execution-matrix';
import { buildCapabilityState } from './capability-model';
import { buildFlowProjection } from './flow-projection';
import { buildParityGaps } from './parity-gaps';
import { buildProductVision } from './product-vision';
import { buildProductModel } from './product-model';
import { buildExternalSignalState, createExternalSignalProfileState } from './external-signals';
import { runExternalSourcesOrchestrator } from './adapters/external-sources-orchestrator';
import type { ExternalSourcesConfig } from './adapters/external-sources-orchestrator';
import { deriveExternalSourcesTimeoutMs } from './external-sources-timeout';
import { buildPathCoverageState } from './path-coverage-engine';
import { runPulseAutonomousLoop } from './autonomy-loop';
import {
  buildFailedRuntimeProbe,
  buildTimedOutActorEvidence,
  buildTimedOutFlowEvidence,
  buildTimedOutInvariantEvidence,
  buildTimedOutRuntimeProbe,
  buildTimedOutWorldState,
} from './timeout-evidence';
import { PulseExecutionTracer, runPhaseWithTrace } from './execution-trace';
import { runSelfTrustChecks } from './self-trust';
import { runCrossArtifactConsistencyCheck } from './cross-artifact-consistency-check';
import { runDeclaredFlows } from './flows';
import { runDeclaredInvariants } from './invariants';
import { loadParserInventory } from './parser-registry';
import { loadPulseLocalEnv } from './local-env';
import { runSyntheticActors } from './actors';
import { getProfileSelection } from './profiles';
import type {
  PulseFlowEvidence,
  PulseInvariantEvidence,
  PulseRuntimeProbe,
  PulseWorldState,
} from './types';
import {
  collectObservabilityEvidence,
  collectRecoveryEvidence,
  collectRuntimeProbe,
  getRuntimeProbeIds,
  summarizeRuntimeEvidence,
} from './runtime-evidence';
import { getRuntimeResolution } from './parsers/runtime-utils';
import { readOptionalJson } from './artifacts.io';
import type { PulseDirectiveSnapshot, PulseCertificateSnapshot } from './cert-gate-overclaim';
import type { PulseAutonomyStateSnapshot } from './cert-gate-multi-cycle';

import {
  activateRuntimeParserEnv,
  actorModeRequested,
  deriveBrowserEvidenceFromActors,
  deriveEffectiveEnvironment,
  deriveEffectiveTarget,
  flags,
  queryModeRequested,
  requestedSyntheticModes,
} from './index-cli';
import { buildBrowserEvidenceForIndex } from './index-browser-evidence';
import { printPulseStartupSummary } from './index-preamble';
import { handlePulseOutput } from './index-output';

activateRuntimeParserEnv();

type PulseIndexStageId =
  | 'full-scan'
  | 'runtime-evidence'
  | 'observability-evidence'
  | 'recovery-evidence'
  | 'declared-flows'
  | 'declared-invariants'
  | 'synthetic-actors'
  | 'self-trust-verification'
  | 'final-certification'
  | 'external-sources-orchestration';

type StageArtifactOverrideSource = 'certification' | 'externalSignalState' | 'empty';

type StageArtifactOverrideDescriptor = {
  path: string;
  source: StageArtifactOverrideSource;
  objective: string;
};

type PulseIndexStageDescriptor = {
  id: PulseIndexStageId;
  objective: string;
  dependencies: PulseIndexStageId[];
  artifactOverrides?: StageArtifactOverrideDescriptor[];
};

const PULSE_INDEX_STAGE_DESCRIPTORS: PulseIndexStageDescriptor[] = [
  {
    id: 'full-scan',
    objective:
      'discover codebase, manifest, parser inventory, baseline health, and initial certification inputs',
    dependencies: [],
  },
  {
    id: 'runtime-evidence',
    objective: 'collect registered runtime probes selected by the active profile',
    dependencies: ['full-scan'],
  },
  {
    id: 'observability-evidence',
    objective: 'derive observability proof from the registered runtime evidence surface',
    dependencies: ['runtime-evidence'],
  },
  {
    id: 'recovery-evidence',
    objective: 'derive recovery proof from repository operations evidence',
    dependencies: ['runtime-evidence'],
  },
  {
    id: 'declared-flows',
    objective: 'execute manifest-declared flow checks selected by target metadata',
    dependencies: ['full-scan', 'runtime-evidence'],
  },
  {
    id: 'declared-invariants',
    objective: 'evaluate manifest-declared invariant checks selected by target metadata',
    dependencies: ['full-scan'],
  },
  {
    id: 'synthetic-actors',
    objective: 'execute synthetic actor scenarios requested by manifest/profile metadata',
    dependencies: ['full-scan', 'runtime-evidence', 'declared-flows', 'declared-invariants'],
  },
  {
    id: 'self-trust-verification',
    objective: 'verify cross-artifact consistency using fresh registered in-memory artifacts',
    dependencies: [
      'full-scan',
      'runtime-evidence',
      'declared-flows',
      'declared-invariants',
      'synthetic-actors',
    ],
    artifactOverrides: [
      {
        path: 'PULSE_CERTIFICATE.json',
        source: 'certification',
        objective: 'avoid stale disk reads for the current certificate snapshot',
      },
      {
        path: 'PULSE_CLI_DIRECTIVE.json',
        source: 'empty',
        objective: 'reserve directive slot until output publication writes fresh data',
      },
      {
        path: 'PULSE_ARTIFACT_INDEX.json',
        source: 'empty',
        objective: 'reserve artifact-index slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_AUTONOMY_PROOF.json',
        source: 'empty',
        objective: 'reserve autonomy-proof slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_AUTONOMY_STATE.json',
        source: 'empty',
        objective: 'reserve autonomy-state slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_AGENT_ORCHESTRATION_STATE.json',
        source: 'empty',
        objective: 'reserve agent-orchestration slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json',
        source: 'externalSignalState',
        objective: 'attach fresh external signal state derived before self-trust',
      },
      {
        path: '.pulse/current/PULSE_CONVERGENCE_PLAN.json',
        source: 'empty',
        objective: 'reserve convergence-plan slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_PRODUCT_VISION.json',
        source: 'empty',
        objective: 'reserve product-vision slot until output publication writes fresh data',
      },
    ],
  },
  {
    id: 'final-certification',
    objective: 'compute final certification from registered evidence and self-trust output',
    dependencies: ['self-trust-verification'],
  },
  {
    id: 'external-sources-orchestration',
    objective: 'collect registered live external adapter evidence for final derived outputs',
    dependencies: ['final-certification'],
  },
];

const PULSE_INDEX_STAGE_REGISTRY = new Map(
  PULSE_INDEX_STAGE_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]),
);

function getRegisteredStage(stageId: PulseIndexStageId): PulseIndexStageDescriptor {
  const descriptor = PULSE_INDEX_STAGE_REGISTRY.get(stageId);
  if (!descriptor) {
    throw new Error(`PULSE stage is not registered: ${stageId}`);
  }
  return descriptor;
}

function buildStageMetadata(
  stageId: PulseIndexStageId,
  metadata: Record<string, string | number | boolean> = {},
): Record<string, string | number | boolean> {
  const stage = getRegisteredStage(stageId);
  return {
    registeredStage: stage.id,
    objective: stage.objective,
    dependencies: stage.dependencies.length > 0 ? stage.dependencies.join(',') : 'none',
    ...metadata,
  };
}

function printRegisteredStagePlan(humanReadableOutput: boolean): void {
  if (!humanReadableOutput) {
    return;
  }

  console.log('  Registered stages/dependencies/objective:');
  for (const stage of PULSE_INDEX_STAGE_DESCRIPTORS) {
    const dependencies = stage.dependencies.length > 0 ? stage.dependencies.join(', ') : 'none';
    console.log(
      `    - ${stage.id} | dependencies: ${dependencies} | objective: ${stage.objective}`,
    );
  }
}

function cloneObjectRecord(value: object): Record<string, unknown> {
  return { ...(value as Record<string, unknown>) };
}

function buildRegisteredArtifactOverrides(input: {
  stageId: PulseIndexStageId;
  certification: object;
  externalSignalState: object;
}): Record<string, Record<string, unknown>> {
  const stage = getRegisteredStage(input.stageId);
  const overrideDescriptors = stage.artifactOverrides || [];
  return Object.fromEntries(
    overrideDescriptors.map((descriptor) => {
      const payload =
        descriptor.source === 'certification'
          ? cloneObjectRecord(input.certification)
          : descriptor.source === 'externalSignalState'
            ? cloneObjectRecord(input.externalSignalState)
            : {};
      return [descriptor.path, payload];
    }),
  );
}

async function runRegisteredStage<T>(
  tracer: PulseExecutionTracer,
  stageId: PulseIndexStageId,
  fn: () => Promise<T> | T,
  options: {
    timeoutMs?: number;
    metadata?: Record<string, string | number | boolean>;
    onTimeout?: () => T | Promise<T>;
  } = {},
): Promise<T> {
  return runPhaseWithTrace(tracer, stageId, fn, {
    ...options,
    metadata: buildStageMetadata(stageId, options.metadata),
  });
}

function deriveFullScanTimeoutMs(
  config: ReturnType<typeof detectConfig>,
  includeParser: ((name: string) => boolean) | undefined,
  parserTimeoutMs: number | undefined,
  phaseTimeoutMs: number | undefined,
): number | undefined {
  if (!parserTimeoutMs || parserTimeoutMs <= 0) {
    return phaseTimeoutMs;
  }
  const parserInventory = loadParserInventory(config, { includeParser });
  const parserBudgetMs = parserInventory.loadedChecks.length * parserTimeoutMs;
  const baseScanOverheadMs = 120_000;
  const unavailableBudgetMs = parserInventory.unavailableChecks.length * 250;
  const dynamicBudgetMs = parserBudgetMs + baseScanOverheadMs + unavailableBudgetMs;
  return Math.max(phaseTimeoutMs ?? 0, dynamicBudgetMs);
}
import "./__companions__/index.companion";
