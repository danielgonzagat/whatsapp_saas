/**
 * PULSE Observability Coverage Engine
 *
 * Static scanner that maps every capability and flow to its observability
 * posture across eight pillars: logs, metrics, tracing, alerts, dashboards,
 * health_probes, error_budget, and sentry.
 *
 * Runs synchronously against the filesystem. Stores its output at
 * `.pulse/current/PULSE_OBSERVABILITY_COVERAGE.json`.
 */

export { buildObservabilityCoverage } from './__parts__/observability-coverage/main';
export { scanForLogging } from './__parts__/observability-coverage/logging';
export { scanForStructuredFields } from './__parts__/observability-coverage/logging';
export { scanPerFileLogging } from './__parts__/observability-coverage/logging';
export { computeLogQuality } from './__parts__/observability-coverage/logging';
export { scanForMetrics } from './__parts__/observability-coverage/scanners';
export { scanForTracing } from './__parts__/observability-coverage/scanners';
export { scanForErrorTracking } from './__parts__/observability-coverage/scanners';
export { detectIntegrationsWithoutObservability } from './__parts__/observability-coverage/integrations';
