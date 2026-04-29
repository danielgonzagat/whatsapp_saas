/**
 * Unit tests for external adapter status gates.
 * Required adapters must block certification if not_available.
 * Optional adapters must not block.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { evaluateMultiCycleConvergenceGate } from '../cert-gate-multi-cycle';
import { buildExternalSignalState } from '../external-signals';
import {
  isAdapterRequired,
  normalizeExternalSignalProfile,
} from '../adapters/external-sources-orchestrator';
import type { BuildExternalSignalStateInput } from '../external-signals';
import type { PulseAutonomyIterationRecord } from '../types';
import type { ConsolidatedExternalState } from '../adapters/external-sources-orchestrator';

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
  'requiredness' | 'requirement' | 'required' | 'blocking' | 'proofBasis' | 'missingReason'
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
    sources: sources.map((source) => ({
      ...source,
      requiredness: 'optional',
      requirement: 'optional',
      required: false,
      blocking: false,
      proofBasis: 'live_adapter',
      missingReason: null,
    })),
    allSignals: [],
    signalsBySource: {},
    criticalSignals: [],
    highSignals: [],
    totalSeverity: 0,
  };
}

describe('external-adapters — required vs optional', () => {
  describe('profile-scoped external signal requiredness', () => {
    it('keeps Prometheus optional for pulse-core-final and required for full-product', () => {
      expect(isAdapterRequired('prometheus', 'pulse-core-final')).toBe(false);
      expect(isAdapterRequired('prometheus', 'full-product')).toBe(true);
    });

    it('requires profile-dependent adapters only for canonical final profiles', () => {
      expect(isAdapterRequired('codecov', 'core-critical')).toBe(false);
      expect(isAdapterRequired('codecov', 'pulse-core-final')).toBe(true);
      expect(isAdapterRequired('codecov', 'full-product')).toBe(true);
    });

    it('normalizes the legacy production-final alias to full-product', () => {
      expect(normalizeExternalSignalProfile('production-final')).toBe('full-product');
      expect(isAdapterRequired('prometheus', 'production-final')).toBe(true);
    });

    it('classifies optional unavailable adapters without adding them to required blockers', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-adapter-classification-'));
      try {
        const state = buildExternalSignalState(
          buildExternalInput(
            rootDir,
            buildLiveExternalState([
              {
                source: 'prometheus',
                status: 'not_available',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason: 'Prometheus base URL was not configured for the live adapter.',
              },
            ]),
          ),
        );

        const prometheus = state.adapters.find((adapter) => adapter.source === 'prometheus');

        expect(prometheus).toMatchObject({
          requirement: 'optional',
          required: false,
          observed: false,
          blocking: false,
          proofBasis: 'live_adapter',
        });
        expect(state.summary.optionalNotAvailableList).toContain('prometheus');
        expect(state.summary.missingAdaptersList).not.toContain('prometheus');
        expect(state.summary.blockingAdaptersList).not.toContain('prometheus');
        expect(state.summary.requiredAdapters).toBeGreaterThan(0);
        expect(state.summary.optionalAdapters).toBeGreaterThan(0);
        expect(state.summary.blockingAdapters).toBe(state.summary.blockingAdaptersList.length);
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });
  });

  describe('GitHub live adapter precedence over stale snapshots', () => {
    it('does not reuse stale GitHub snapshots as live evidence when live credentials are unavailable', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-adapters-'));
      try {
        writeJson(path.join(rootDir, 'PULSE_GITHUB_STATE.json'), {
          generatedAt: '2026-04-20T00:00:00.000Z',
          signals: [{ id: 'github:old', summary: 'Old GitHub snapshot.' }],
        });
        writeJson(path.join(rootDir, 'PULSE_GITHUB_ACTIONS_STATE.json'), {
          generatedAt: '2026-04-20T00:00:00.000Z',
          runs: [{ id: 'old-run', name: 'CI', conclusion: 'failure' }],
        });

        const state = buildExternalSignalState(
          buildExternalInput(
            rootDir,
            buildLiveExternalState([
              {
                source: 'github',
                status: 'not_available',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason: 'GitHub owner/repo were not configured for the live adapter.',
              },
              {
                source: 'github_actions',
                status: 'not_available',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason: 'GitHub Actions token/owner/repo were not configured for the live adapter.',
              },
            ]),
          ),
        );

        const github = state.adapters.find((adapter) => adapter.source === 'github');
        const actions = state.adapters.find((adapter) => adapter.source === 'github_actions');

        expect(github?.status).toBe('not_available');
        expect(actions?.status).toBe('not_available');
        expect(github?.reason).toContain('required under profile=pulse-core-final');
        expect(github?.requiredness).toBe('required');
        expect(github?.requirement).toBe('required');
        expect(github?.required).toBe(true);
        expect(github?.blocking).toBe(true);
        expect(github?.proofBasis).toBe('live_adapter');
        expect(github?.missingReason).toContain(
          'github is required under profile=pulse-core-final',
        );
        expect(github?.missingReason).toContain('blocking external proof closure');
        expect(actions?.reason).toContain('was not reused as live external reality');
        expect(state.summary.staleAdaptersList).not.toContain('github');
        expect(state.summary.staleAdaptersList).not.toContain('github_actions');
        expect(state.summary.missingAdaptersList).toContain('github');
        expect(state.summary.missingAdaptersList).toContain('github_actions');
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });

    it('prefers fresh live GitHub Actions state over a stale snapshot when credentials are configured', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-adapters-'));
      try {
        writeJson(path.join(rootDir, 'PULSE_GITHUB_ACTIONS_STATE.json'), {
          generatedAt: '2026-04-20T00:00:00.000Z',
          runs: [{ id: 'old-run', name: 'CI', conclusion: 'failure' }],
        });

        const state = buildExternalSignalState(
          buildExternalInput(
            rootDir,
            buildLiveExternalState([
              {
                source: 'github_actions',
                status: 'ready',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason:
                  'GitHub Actions live adapter is configured but returned no actionable signals.',
              },
            ]),
          ),
        );

        const actions = state.adapters.find((adapter) => adapter.source === 'github_actions');

        expect(actions?.sourcePath).toBe('live:github_actions');
        expect(actions?.status).toBe('ready');
        expect(actions?.freshnessMinutes).toBe(0);
        expect(state.summary.staleAdaptersList).not.toContain('github_actions');
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });
  });

  describe('required adapter not_available blocks certification', () => {
    it('should track missingAdapters when required adapter is not_available', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            missingAdapters: ['stripe', 'railway_db'],
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
      expect(result.reason).toContain('missing adapter');
    });

    it('should fail when required adapter status is invalid', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'invalid',
              railway_db: 'stale',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
    });
  });

  describe('optional adapter not_available does not block', () => {
    it('should pass when only optional adapters are not_available', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 75,
            blockingTier: 3,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 78,
            blockingTier: 3,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
    });

    it('should pass when optional adapter has optional_not_configured status', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              slack: 'optional_not_configured',
              notifications: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              slack: 'optional_not_configured',
              notifications: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 81,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              slack: 'optional_not_configured',
              notifications: 'optional_not_configured',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
    });
  });

  describe('mixed required and optional adapters', () => {
    it('should pass when required adapters are ready and optional adapters are optional_not_configured', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 85,
            blockingTier: 1,
            validationCommands: { total: 25, passing: 25 },
            adapterStatus: {
              stripe: 'ready',
              railway_db: 'ready',
              slack: 'optional_not_configured',
              datadog: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 86,
            blockingTier: 1,
            validationCommands: { total: 25, passing: 25 },
            adapterStatus: {
              stripe: 'ready',
              railway_db: 'ready',
              slack: 'optional_not_configured',
              datadog: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 87,
            blockingTier: 1,
            validationCommands: { total: 25, passing: 25 },
            adapterStatus: {
              stripe: 'ready',
              railway_db: 'ready',
              slack: 'optional_not_configured',
              datadog: 'optional_not_configured',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
    });

    it('should fail when required adapter is not_available even with optional adapters ready', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'not_available',
              slack: 'ready',
              datadog: 'ready',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'not_available',
              slack: 'ready',
              datadog: 'ready',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'not_available',
              slack: 'ready',
              datadog: 'ready',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
      expect(result.reason).toContain('stripe');
    });
  });
});
