// PULSE — Live Codebase Nervous System
// Scenario execution result, observability, and recovery evidence types

import type {
  PulseActorKind,
  PulseScenarioKind,
  PulseScenarioRunner,
  PulseProviderMode,
} from './types.health';
import type { PulseGateFailureClass } from './types.gate-failure';

/** Pulse observability evidence shape. */
export interface PulseObservabilityEvidence {
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Signals property. */
  signals: {
    tracingHeadersDetected: boolean;
    requestIdMiddlewareDetected: boolean;
    structuredLoggingDetected: boolean;
    sentryDetected: boolean;
    alertingIntegrationDetected: boolean;
    healthEndpointsDetected: boolean;
    auditTrailDetected: boolean;
  };
}

/** Pulse recovery evidence shape. */
export interface PulseRecoveryEvidence {
  /** Executed property. */
  executed: boolean;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Summary property. */
  summary: string;
  /** Signals property. */
  signals: {
    backupManifestPresent: boolean;
    backupPolicyPresent: boolean;
    backupValidationPresent: boolean;
    restoreRunbookPresent: boolean;
    disasterRecoveryRunbookPresent: boolean;
    disasterRecoveryTestPresent: boolean;
    seedScriptPresent: boolean;
  };
}

/** Pulse scenario result shape. */
export interface PulseScenarioResult {
  /** Scenario id property. */
  scenarioId: string;
  /** Actor kind property. */
  actorKind: PulseActorKind;
  /** Scenario kind property. */
  scenarioKind: PulseScenarioKind;
  /** Critical property. */
  critical: boolean;
  /** Requested property. */
  requested: boolean;
  /** Runner property. */
  runner: PulseScenarioRunner;
  /** Status property. */
  status: 'passed' | 'failed' | 'missing_evidence' | 'checker_gap' | 'skipped';
  /** Executed property. */
  executed: boolean;
  /** Provider mode used property. */
  providerModeUsed?: PulseProviderMode;
  /** Smoke executed property. */
  smokeExecuted?: boolean;
  /** Replay executed property. */
  replayExecuted?: boolean;
  /** World state converged property. */
  worldStateConverged?: boolean;
  /** Failure class property. */
  failureClass?: PulseGateFailureClass;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Specs executed property. */
  specsExecuted: string[];
  /** Duration ms property. */
  durationMs: number;
  /** World state touches property. */
  worldStateTouches: string[];
  /** Metrics property. */
  metrics?: Record<string, string | number | boolean>;
  /** Module keys property. */
  moduleKeys: string[];
  /** Route patterns property. */
  routePatterns: string[];
}
