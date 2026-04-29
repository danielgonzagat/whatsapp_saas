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
  /** Pillars property. */
  pillars: Record<ObservabilityPillar, ObservabilityStatus>;
  /** Details property. */
  details: {
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
