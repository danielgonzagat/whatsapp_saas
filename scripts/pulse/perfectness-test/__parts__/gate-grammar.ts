// PULSE — Live Codebase Nervous System
// Perfectness Test Harness — Gate Grammar (Part 1)
//
// Constants and canonical gate definitions for the 8-gate perfectness suite.

import * as path from 'path';

import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverPropertyPassedStatusFromTypeEvidence,
  observeStatusTextLengthFromCatalog,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import type {
  ExitAction,
  GateEvidencePlan,
  GateEvidenceSource,
  GateExitCondition,
  PerfectnessGate,
  PerfectnessLongRunEvidence,
  PerfectnessPhase,
  PerfectnessResult,
  PerfectnessTestSuite,
  PerfectnessVerdict,
} from '../../types.perfectness-test';

const _dcps = deriveCatalogPercentScaleFromObservedCatalog();
const _u = deriveUnitValue();
const _artifactCatalog = discoverAllObservedArtifactFilenames();
export const ARTIFACT_FILE_NAME = 'PULSE_PERFECTNESS_RESULT.json';
export const PULSE_CERTIFICATE_FILE = _artifactCatalog.certificate;
export const PULSE_AUTONOMY_STATE_FILE = _artifactCatalog.autonomyState;
export const PULSE_SANDBOX_STATE_FILE = _artifactCatalog.sandboxState;
export const SCENARIO_EVIDENCE_FILE = _artifactCatalog.scenarioEvidence;
export const REQUIRED_LONG_RUN_HOURS =
  _dcps *
  _dcps *
  _dcps *
  observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Not Found'));
export const MAX_LONG_RUN_GAP_HOURS = _dcps * _dcps + _dcps;

export { _dcps, _u };

// ────────────────────────────────────────────────────────────────────────────
// Gate Definitions (canonical 8-gate suite)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The canonical 8-gate perfectness evaluation suite.
 *
 * Each gate defines what is being checked, the target condition,
 * and a plain-language description.
 */
export const PERFECTNESS_EVALUATION_KERNEL_GRAMMAR = [
  {
    name: 'pulse-core-green',
    description: 'All PULSE certification gates pass',
    target: 'All certification gates status=pass AND score >= 50',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'product-core-green',
    description: 'All critical capabilities are real (not partial/latent/phantom)',
    target: 'Certification score >= 60 (proxy for critical capability health)',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'e2e-core-pass',
    description: 'Scenario pass rate meets threshold',
    target: 'scenario pass rate >= 90%',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'runtime-stable',
    description: 'No new critical failures during evaluation period',
    target: 'new critical errors = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: 'no-regression',
    description: 'Final score not lower than start score',
    target: 'score end >= score start',
    phase: 'verdict' as PerfectnessPhase,
  },
  {
    name: 'no-rollback-unrecovered',
    description: 'All rollbacks successfully recovered',
    target: 'unrecovered rollbacks = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: 'no-protected-violation',
    description: 'Zero protected file changes during autonomous work',
    target: 'protected violations = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: '72h-elapsed',
    description: 'At least 72 hours of autonomous work completed',
    target: 'duration >= 72h',
    phase: 'verdict' as PerfectnessPhase,
  },
] as const;
