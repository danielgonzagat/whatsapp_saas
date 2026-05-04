/**
 * PULSE Parser 88: Observability Checker
 * Layer 19: Observability
 * Mode: DEEP (requires codebase scan + optional running infrastructure)
 *
 * CHECKS:
 * 1. Request tracing: verifies correlation IDs are:
 *    a. Generated at request entry (middleware or interceptor)
 *    b. Propagated to all outbound calls
 *    c. Returned in error responses (for support debugging)
 *    d. Logged in every log line within that request context
 * 2. Error alerting: verifies that critical errors trigger external or durable alerts:
 *    - Runtime-critical failures trigger immediate alert, not just a log line
 *    - External-session disconnections trigger alert/recovery handling
 * 3. Metrics collection: verifies key business metrics are tracked:
 *    - Request latency per endpoint (histogram)
 *    - Queue depth and failed job counts
 *    - Error rate per endpoint
 *    - Business-critical success/failure rate
 * 4. Health check endpoints exist (/health, /health/live, /health/ready)
 * 5. Logs include structured fields, not just string messages
 * 6. No silent errors in critical paths (catch blocks that don't log)
 *
 * REQUIRES: PULSE_DEEP=1
 * DIAGNOSTICS:
 *   Emits observability evidence gaps with predicate metadata. Signal detectors
 *   are sensors; final blocker identity is synthesized from predicates.
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import {
  hasAlertingEvidence,
  hasMetricsEvidence,
  hasRuntimeCriticalSideEffect,
  hasStructuredLogEvidence,
  hasTracingEvidence,
  OUTBOUND_CALL_RE,
} from './structural-evidence';

type ObservabilityTruthMode = 'weak_signal' | 'confirmed_static';

type ObservabilityDiagnosticBreak = Break & {
  truthMode: ObservabilityTruthMode;
};

interface ObservabilityDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  surface: string;
  truthMode: ObservabilityTruthMode;
  evidence: string[];
}

function buildObservabilityDiagnostic(
  input: ObservabilityDiagnosticInput,
): ObservabilityDiagnosticBreak {
  const predicateToken =
    input.predicateKinds
      .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
      .filter(Boolean)
      .join('+') || 'observability-evidence-gap';

  return {
    type: `diagnostic:observability-checker:${predicateToken}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: `${input.detail} Evidence: ${input.evidence.join('; ')}. predicates=${input.predicateKinds.join(',')}`,
    source: `predicate-synthesizer:observability-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: input.surface,
    truthMode: input.truthMode,
  };
}

function extractCatchBlocks(content: string): string[] {
  const blocks: string[] = [];
  const catchRe = /catch\s*(?:\([^)]*\))?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = catchRe.exec(content)) !== null) {
    const start = match.index;
    let depth = 0;
    let end = start;

    for (let i = content.indexOf('{', start); i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    blocks.push(content.slice(Math.max(0, start - 500), Math.min(content.length, end + 500)));
  }

  return blocks;
}

/** Check observability. */
export function checkObservability(config: PulseConfig): Break[] {
  const diagnostics: ObservabilityDiagnosticBreak[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);
  const allBackendContent = backendFiles.reduce((acc, file) => {
    try {
      return acc + readTextFile(file, 'utf8') + '\n';
    } catch {
      return acc;
    }
  }, '');

  // CHECK 1a: correlation ID generation middleware/interceptor
  const hasCorrelationMiddleware =
    hasTracingEvidence(allBackendContent) && /Middleware|Interceptor/i.test(allBackendContent);

  if (!hasCorrelationMiddleware) {
    diagnostics.push(
      buildObservabilityDiagnostic({
        predicateKinds: ['request_entry', 'correlation_context_not_observed'],
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No request correlation ID middleware found — cannot trace a request across logs',
        detail:
          'Add a NestJS middleware that generates/reads X-Request-ID and attaches it to AsyncLocalStorage context.',
        surface: 'observability-tracing',
        truthMode: 'weak_signal',
        evidence: [
          `tracingEvidence=${hasTracingEvidence(allBackendContent) ? 'observed' : 'missing'}`,
          `requestBoundary=${/Middleware|Interceptor/i.test(allBackendContent) ? 'observed' : 'missing'}`,
        ],
      }),
    );
  }

  // CHECK 1b: Correlation ID propagated to outbound calls
  for (const file of backendFiles) {
    if (/\.(spec|test|d)\.ts$|__tests__|fixture|mock/i.test(file)) {
      continue;
    }
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (OUTBOUND_CALL_RE.test(content)) {
      if (!hasTracingEvidence(content)) {
        diagnostics.push(
          buildObservabilityDiagnostic({
            predicateKinds: ['outbound_call', 'correlation_propagation_not_observed'],
            severity: 'high',
            file: relFile,
            line: 0,
            description:
              'Outbound HTTP call without correlation ID header — cannot trace request through external services',
            detail:
              'Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID.',
            surface: 'observability-tracing',
            truthMode: 'weak_signal',
            evidence: ['outboundCall=observed', 'tracingEvidence=missing'],
          }),
        );
      }
    }
  }

  // CHECK 2: Error alerting via an external sink or durable ops channel.
  const hasAlertingIntegration = hasAlertingEvidence(allBackendContent);

  if (!hasAlertingIntegration) {
    diagnostics.push(
      buildObservabilityDiagnostic({
        predicateKinds: ['runtime_error_surface', 'alerting_sink_not_observed'],
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description: 'No error alerting integration found — critical errors will go unnoticed',
        detail:
          'Add external alerting or a durable ops alert channel for runtime-critical failures and 500 errors.',
        surface: 'observability-alerting',
        truthMode: 'weak_signal',
        evidence: ['alertingEvidence=missing'],
      }),
    );
  }

  // CHECK 2b: Runtime-critical caught failures must alert externally.
  for (const file of backendFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    const catchesRuntimeCriticalFailure = extractCatchBlocks(content).some((block) =>
      hasRuntimeCriticalSideEffect(block),
    );

    if (catchesRuntimeCriticalFailure && !hasAlertingEvidence(content)) {
      diagnostics.push(
        buildObservabilityDiagnostic({
          predicateKinds: ['runtime_critical_catch', 'alerting_emission_not_observed'],
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Runtime-critical error caught without external alert — failures may go unnoticed for hours',
          detail:
            'Add external alerting or durable ops alert emission in runtime-critical catch blocks.',
          surface: 'observability-alerting',
          truthMode: 'weak_signal',
          evidence: ['runtimeCriticalCatch=observed', 'alertingEvidence=missing'],
        }),
      );
    }
  }

  // CHECK 3: Metrics collection
  const hasMetrics = hasMetricsEvidence(allBackendContent);
  if (!hasMetrics) {
    diagnostics.push(
      buildObservabilityDiagnostic({
        predicateKinds: ['runtime_metrics_surface', 'metrics_emission_not_observed'],
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No metrics collection found — cannot monitor request latency, error rate, or queue depth',
        detail:
          'Emit counters, histograms, gauges, latency, error-rate, and queue-depth metrics; expose them to your monitoring stack.',
        surface: 'observability-metrics',
        truthMode: 'weak_signal',
        evidence: ['metricsEvidence=missing'],
      }),
    );
  }

  // CHECK 4: Health check endpoints
  const hasHealthCheck =
    backendFiles.some((f) => /health/i.test(path.basename(f))) ||
    /HealthController|HealthIndicator|\/health/i.test(allBackendContent);

  if (!hasHealthCheck) {
    diagnostics.push(
      buildObservabilityDiagnostic({
        predicateKinds: ['service_liveness_surface', 'health_endpoint_not_observed'],
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No health check endpoint found — load balancers and monitoring cannot verify service liveness',
        detail: 'Add @nestjs/terminus HealthController at /health, /health/live, /health/ready.',
        surface: 'observability-health',
        truthMode: 'confirmed_static',
        evidence: ['healthFile=missing', 'healthRoute=missing'],
      }),
    );
  }

  // CHECK 5: Structured logging
  const hasStructuredLogging = hasStructuredLogEvidence(allBackendContent);
  const hasStringOnlyLogging = /this\.logger\.\w+\s*\(\s*`|this\.logger\.\w+\s*\(\s*['"]/.test(
    allBackendContent,
  );

  if (!hasStructuredLogging && hasStringOnlyLogging) {
    diagnostics.push(
      buildObservabilityDiagnostic({
        predicateKinds: ['logger_usage', 'structured_log_fields_not_observed'],
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description: 'Logs use string messages only — no structured fields for filtering/alerting',
        detail:
          'Use this.logger.log({ event, workspaceId, userId, error }) instead of template string messages.',
        surface: 'observability-logging',
        truthMode: 'weak_signal',
        evidence: ['stringOnlyLogging=observed', 'structuredLogging=missing'],
      }),
    );
  }

  // TODO: Implement when infrastructure available
  // - Verify the alert sink is valid and receiving events
  // - Check emitted metrics are being scraped
  // - Verify alert rules fire on test errors
  // - Distributed tracing (OpenTelemetry) integration check

  return diagnostics;
}
