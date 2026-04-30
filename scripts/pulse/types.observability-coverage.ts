// PULSE — Live Codebase Nervous System
// Observability coverage types

export type ObservabilityPillar =
  | 'logs'
  | 'metrics'
  | 'tracing'
  | 'alerts'
  | 'dashboards'
  | 'health_probes'
  | 'error_budget'
  | 'sentry';
export type ObservabilityStatus = 'observed' | 'missing' | 'partial' | 'not_applicable';
export type ObservabilityTruthMode = 'observed' | 'inferred' | 'not_available';

/** Evidence class used to keep configured/catalogued observability separate from observed proof. */
export type ObservabilityEvidenceKind =
  | 'runtime_observed'
  | 'static_instrumentation'
  | 'configuration'
  | 'catalog'
  | 'simulated'
  | 'absent'
  | 'not_applicable';

/** Per-pillar evidence provenance. */
export interface ObservabilityPillarEvidence {
  /** Pillar property. */
  pillar: ObservabilityPillar;
  /** Normalized status property. */
  status: ObservabilityStatus;
  /** Evidence kind property. */
  sourceKind: ObservabilityEvidenceKind;
  /** Whether this pillar has observed, trusted evidence. */
  observed: boolean;
  /** Human-readable source label. */
  source: string;
  /** Human-readable reason. */
  reason: string;
  /** Relative file paths that support this classification. */
  filePaths: string[];
  /** Explicit truth mode for the evidence claim. */
  truthMode: ObservabilityTruthMode;
  /** Machine-facing signal when PULSE needs stronger proof for this pillar. */
  machineImprovementSignal: ObservabilityMachineImprovementSignal | null;
}

export interface ObservabilityMachineImprovementSignal {
  id: string;
  targetEngine:
    | 'observability-coverage'
    | 'otel-runtime'
    | 'runtime-probes'
    | 'external-sources-orchestrator';
  capabilityId: string;
  pillar: ObservabilityPillar;
  truthMode: ObservabilityTruthMode;
  sourceKind: ObservabilityEvidenceKind;
  status: ObservabilityStatus;
  reason: string;
  recommendedPulseAction: string;
  productEditRequired: false;
}

/** Code-level instrumentation quality score. */
export type LogQuality = 'comprehensive' | 'adequate' | 'minimal' | 'none';

/** Per-file logging posture. */
export interface PerFileLoggingEntry {
  /** Absolute file path. */
  filePath: string;
  /** Has at least one structured-logger call (this.logger, Logger.*, winston, pino). */
  hasStructured: boolean;
  /** Has at least one console.log/error/warn call. */
  hasConsole: boolean;
  /** Has at least one error-logging call (log.error, console.error, Sentry). */
  hasErrorLogging: boolean;
  /** Has zero log calls. */
  noLogging: boolean;
  /** Structured-log field names found in this file. */
  structuredFieldsFound: string[];
  /** Whether this file uses @Span or tracer/startSpan instrumentation. */
  hasTracing: boolean;
  /** Whether this file uses Sentry.captureException or equivalent. */
  hasSentry: boolean;
}

/** Per-capability observability detail. */
export interface CapabilityObservability {
  /** Capability id property. */
  capabilityId: string;
  /** Capability name property. */
  capabilityName: string;
  /** Runtime critical property. */
  runtimeCritical: boolean;
  /** Pillars property. */
  pillars: Record<ObservabilityPillar, ObservabilityStatus>;
  /** Per-pillar evidence provenance. */
  evidence: Record<ObservabilityPillar, ObservabilityPillarEvidence>;
  /** Details property. */
  details: {
    matchedFilePaths: string[];
    logCount: number;
    metricNames: string[];
    traceSpans: number;
    alertRules: number;
    dashboardUrls: string[];
    healthProbeUrl: string | null;
    errorBudgetRemaining: number | null;
    sentryProjectId: string | null;
    structuredLogFields: string[];
    perFileLogging: PerFileLoggingEntry[];
  };
  /** Overall status property (pillar-based). */
  overallStatus: 'covered' | 'partial' | 'uncovered';
  /** Code-level instrumentation quality (4-tier). */
  logQuality: LogQuality;
  /** Trusted observed pillars property. */
  trustedObservedPillars: ObservabilityPillar[];
  /** Pillars that were present only through catalog/configuration/simulation. */
  untrustedEvidencePillars: ObservabilityPillar[];
  /** Whether a critical capability still claims observed coverage from an untrusted source. */
  criticalObservedByUntrustedSource: boolean;
  /** Machine-facing signals for missing or scan-mode-only observability proof. */
  machineImprovementSignals: ObservabilityMachineImprovementSignal[];
}

/** Per-flow observability rollup. */
export interface FlowObservability {
  /** Flow id property. */
  flowId: string;
  /** Flow name property. */
  flowName: string;
  /** Pillars property. */
  pillars: Record<ObservabilityPillar, ObservabilityStatus>;
  /** Capabilities property. */
  capabilities: CapabilityObservability[];
  /** Overall status property. */
  overallStatus: 'covered' | 'partial' | 'uncovered';
}

/** Full observability coverage state artifact. */
export interface ObservabilityCoverageState {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: {
    totalCapabilities: number;
    fullyCoveredCapabilities: number;
    partiallyCoveredCapabilities: number;
    uncoveredCapabilities: number;
    totalFlows: number;
    fullyCoveredFlows: number;
    criticalCapabilitiesWithoutAlerts: number;
    criticalFlowsWithoutTracing: number;
    integrationsWithoutObservability: number;
    capabilitiesWithComprehensiveLogging: number;
    capabilitiesWithAdequateLogging: number;
    capabilitiesWithMinimalLogging: number;
    capabilitiesWithNoLogging: number;
    filesWithStructuredLogging: number;
    filesWithConsoleOnly: number;
    filesWithNoLogging: number;
    filesWithErrorLogging: number;
    machineImprovementSignals: number;
  };
  /** Capabilities property. */
  capabilities: CapabilityObservability[];
  /** Flows property. */
  flows: FlowObservability[];
  /** Top gaps property. */
  topGaps: Array<{
    capabilityId: string;
    missingPillars: ObservabilityPillar[];
    severity: 'critical' | 'high' | 'medium';
  }>;
}
