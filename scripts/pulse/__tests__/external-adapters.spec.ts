/**
 * Unit tests for external adapter status gates.
 * Required adapters must block certification if not_available.
 * Optional adapters must not block.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { evaluateMultiCycleConvergenceGate } from '../cert-gate-multi-cycle';
import { buildExternalSignalState } from '../external-signals';
import {
  classifyLiveExternalSource,
  discoverExternalSourceCapabilities,
  isAdapterRequired,
  normalizeExternalSignalProfile,
} from '../adapters/external-sources-orchestrator';
import type { BuildExternalSignalStateInput } from '../external-signals';
import type { PulseAutonomyIterationRecord } from '../types';
import type {
  ConsolidatedExternalState,
  ExternalSourceRunResult,
} from '../adapters/external-sources-orchestrator';

type LegacyAdapterStatus =
  | 'ready'
  | 'not_available'
  | 'stale'
  | 'invalid'
  | 'optional_not_configured';

interface LegacyConvergenceCycleInput {
  cycleId: string;
  timestamp: string;
  status: 'completed';
  score: number;
  blockingTier: number;
  validationCommands: {
    total: number;
    passing: number;
  };
  missingAdapters?: string[];
  optionalAdapters?: string[];
  adapterStatus?: Record<string, LegacyAdapterStatus>;
}

type LegacyConvergenceCycle = PulseAutonomyIterationRecord & LegacyConvergenceCycleInput;

interface LegacyConvergenceState {
  history: LegacyConvergenceCycle[];
}

type LiveExternalSourceInput = Omit<
  ConsolidatedExternalState['sources'][number],
  | 'requiredness'
  | 'requirement'
  | 'required'
  | 'blocking'
  | 'proofBasis'
  | 'missingReason'
  | 'sourceCapability'
>;

function legacyCycle(input: LegacyConvergenceCycleInput): LegacyConvergenceCycle {
  const directiveSnapshot = {
    blockingTier: input.blockingTier,
    certificationStatus: 'PARTIAL',
    score: input.score,
    visionGap: 'external adapter test',
  };

  return {
    ...input,
    codex: {
      command: 'legacy convergence fixture',
      executed: true,
      exitCode: 0,
      finalMessage: 'completed',
    },
    directiveDigestAfter: null,
    directiveDigestBefore: null,
    directiveAfter: directiveSnapshot,
    directiveBefore: directiveSnapshot,
    finishedAt: input.timestamp,
    improved: true,
    iteration: Number(input.cycleId.replace('cycle-', '')),
    plannerMode: 'deterministic',
    startedAt: input.timestamp,
    strategyMode: null,
    summary: input.cycleId,
    unit: null,
    validation: {
      commands: [],
      executed: true,
    },
  };
}

function evaluateLegacyConvergenceGate(autonomyState: LegacyConvergenceState) {
  return evaluateMultiCycleConvergenceGate(autonomyState);
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function buildExternalInput(
  rootDir: string,
  liveExternalState: ConsolidatedExternalState,
): BuildExternalSignalStateInput {
  const generatedAt = '2026-04-29T21:00:00.000Z';
  return {
    rootDir,
    liveExternalState,
    codacyEvidence: {
      generatedAt,
      summary: {
        snapshotAvailable: true,
        stale: false,
        totalIssues: 0,
        highIssues: 0,
        runtimeCriticalHotspots: 0,
        userFacingHotspots: 0,
        humanRequiredHotspots: 0,
      },
      hotspots: [],
    },
    capabilityState: {
      generatedAt,
      summary: {
        totalCapabilities: 0,
        realCapabilities: 0,
        partialCapabilities: 0,
        latentCapabilities: 0,
        phantomCapabilities: 0,
        humanRequiredCapabilities: 0,
        foundationalCapabilities: 0,
        connectedCapabilities: 0,
        operationalCapabilities: 0,
        productionReadyCapabilities: 0,
        runtimeObservedCapabilities: 0,
        scenarioCoveredCapabilities: 0,
      },
      capabilities: [],
    },
    flowProjection: {
      generatedAt,
      summary: {
        totalFlows: 0,
        realFlows: 0,
        partialFlows: 0,
        latentFlows: 0,
        phantomFlows: 0,
      },
      flows: [],
    },
    scopeState: {
      generatedAt,
      rootDir,
      summary: {
        totalFiles: 0,
        totalLines: 0,
        runtimeCriticalFiles: 0,
        userFacingFiles: 0,
        humanRequiredFiles: 0,
        surfaceCounts: {
          frontend: 0,
          'frontend-admin': 0,
          backend: 0,
          worker: 0,
          prisma: 0,
          e2e: 0,
          scripts: 0,
          docs: 0,
          infra: 0,
          governance: 0,
          'root-config': 0,
          artifacts: 0,
          misc: 0,
        },
        kindCounts: {
          source: 0,
          spec: 0,
          migration: 0,
          config: 0,
          document: 0,
          artifact: 0,
        },
        unmappedModuleCandidates: [],
        inventoryCoverage: 100,
        classificationCoverage: 100,
        structuralGraphCoverage: 100,
        testCoverage: 0,
        scenarioCoverage: 0,
        runtimeEvidenceCoverage: 0,
        productionProofCoverage: 0,
        orphanFiles: [],
        unknownFiles: [],
      },
      parity: {
        status: 'pass',
        mode: 'repo_inventory_with_codacy_spotcheck',
        confidence: 'high',
        reason: 'test',
        inventoryFiles: 0,
        codacyObservedFiles: 0,
        codacyObservedFilesCovered: 0,
        missingCodacyFiles: [],
      },
      codacy: {
        snapshotAvailable: true,
        sourcePath: 'PULSE_CODACY_STATE.json',
        stale: false,
        syncedAt: generatedAt,
        ageMinutes: 0,
        loc: 0,
        totalIssues: 0,
        severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
        toolCounts: {},
        topFiles: [],
        highPriorityBatch: [],
        observedFiles: [],
      },
      files: [],
      moduleAggregates: [],
      excludedFiles: [],
      scopeSource: 'repo_filesystem',
      manifestBoundary: false,
      manifestRole: 'semantic_overlay',
    },
  };
}

function buildLiveExternalState(sources: LiveExternalSourceInput[]): ConsolidatedExternalState {
  return {
    generatedAt: '2026-04-29T21:00:00.000Z',
    profile: 'pulse-core-final',
    certificationScope: 'pulse-core-final',
    sourceCapabilities: [],
    sources: sources.map((source) => ({
      ...source,
      requiredness: 'optional',
      requirement: 'optional',
      required: false,
      blocking: false,
      proofBasis: 'live_adapter',
      missingReason: null,
      sourceCapability: {
        source: source.source,
        discovered: true,
        operational: source.status === 'ready',
        truthAuthority: 'discovered_capability',
        capabilityKinds: ['repo'],
        evidence: [],
        compatRequiredness: 'optional',
        compatRequired: false,
        missingOperationalRequirements: [],
      },
    })),
    allSignals: [],
    signalsBySource: {},
    criticalSignals: [],
    highSignals: [],
    totalSeverity: 0,
  };
}
