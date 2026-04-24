/**
 * Runtime signal parsers: sentry, datadog, prometheus.
 * Companion to signal-parsers.ts — handles observability-platform sources.
 */
import type { PulseSignalDraft } from './signal-parsers';
import {
  asObject,
  asArray,
  toStringArray,
  normalizeFileArray,
  normalizeRouteArray,
  normalizeDate,
  normalizeScore,
  normalizeSummary,
  compact,
} from './signal-normalizers';

export function parseSentrySignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry): PulseSignalDraft | null => {
        const record = asObject(entry);
        if (!record) return null;
        return {
          id:
            (typeof record.id === 'string' && record.id.trim()) ||
            (typeof record.issueId === 'string' && record.issueId.trim()) ||
            `sentry:runtime_error:${normalizeSummary(record.summary || record.message || record.title, 'Sentry runtime signal.')}`,
          type:
            (typeof record.type === 'string' && record.type.trim()) ||
            (typeof record.signalType === 'string' && record.signalType.trim()) ||
            'runtime_error',
          source: 'sentry' as const,
          truthMode: record.truthMode === 'inferred' ? 'inferred' : ('observed' as const),
          severity: normalizeScore(record.severity || record.level || record.priority, 0.5),
          impactScore: normalizeScore(record.impactScore || record.impact || record.weight, 0.55),
          confidence: normalizeScore(record.confidence, 0.8),
          summary: normalizeSummary(
            record.summary || record.message || record.title || record.description,
            'Sentry runtime signal.',
          ),
          observedAt: normalizeDate(
            record.observedAt ||
              record.createdAt ||
              record.updatedAt ||
              record.occurredAt ||
              record.timestamp,
          ),
          relatedFiles: normalizeFileArray(
            rootDir,
            record.relatedFiles || record.files || record.changedFiles || record.stackFiles,
          ),
          routePatterns: normalizeRouteArray(
            record.routePatterns || record.routes || record.paths || record.endpoints,
          ),
          tags: [],
          rawRef:
            (typeof record.url === 'string' && record.url) ||
            (typeof record.htmlUrl === 'string' && record.htmlUrl) ||
            null,
        };
      })
      .filter((entry): entry is PulseSignalDraft => Boolean(entry));
  }

  const issues = asArray(data.issues || data.events)
    .map((entry) => asObject(entry))
    .filter(Boolean);
  return issues
    .filter((issue) => String(issue.status || 'open').toLowerCase() !== 'resolved')
    .map((issue, index) => {
      const title =
        (typeof issue.title === 'string' && issue.title) ||
        (typeof issue.message === 'string' && issue.message) ||
        `Sentry issue ${index + 1}`;
      const occurrences = Number(issue.occurrences || issue.count || issue.eventCount || 1);
      return {
        id:
          (typeof issue.id === 'string' && issue.id) ||
          (typeof issue.issueId === 'string' && issue.issueId) ||
          `sentry-${index}`,
        type: 'runtime_error',
        source: 'sentry' as const,
        truthMode: 'observed' as const,
        severity: normalizeScore(issue.level || issue.severity, 0.85),
        impactScore: Math.min(1, 0.6 + Math.min(Math.max(occurrences, 0), 20) / 50),
        confidence: 0.92,
        summary: compact(title),
        observedAt: normalizeDate(issue.lastSeen || issue.updatedAt || issue.timestamp),
        relatedFiles: normalizeFileArray(
          rootDir,
          issue.relatedFiles || issue.files || issue.stackFiles,
        ),
        routePatterns: normalizeRouteArray(issue.routes || issue.paths || issue.endpoints),
        tags: toStringArray(issue.tags),
        rawRef:
          (typeof issue.url === 'string' && issue.url) ||
          (typeof issue.permalink === 'string' && issue.permalink) ||
          null,
      };
    });
}

export function parseDatadogSignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry): PulseSignalDraft | null => {
        const record = asObject(entry);
        if (!record) return null;
        return {
          id:
            (typeof record.id === 'string' && record.id.trim()) ||
            `datadog:latency_regression:${normalizeSummary(record.summary || record.message || record.title, 'Datadog runtime signal.')}`,
          type: (typeof record.type === 'string' && record.type.trim()) || 'latency_regression',
          source: 'datadog' as const,
          truthMode: record.truthMode === 'inferred' ? 'inferred' : ('observed' as const),
          severity: normalizeScore(record.severity || record.level || record.priority, 0.5),
          impactScore: normalizeScore(record.impactScore || record.impact || record.weight, 0.55),
          confidence: normalizeScore(record.confidence, 0.8),
          summary: normalizeSummary(
            record.summary || record.message || record.title || record.description,
            'Datadog runtime signal.',
          ),
          observedAt: normalizeDate(
            record.observedAt ||
              record.createdAt ||
              record.updatedAt ||
              record.occurredAt ||
              record.timestamp,
          ),
          relatedFiles: normalizeFileArray(rootDir, record.relatedFiles || record.files),
          routePatterns: normalizeRouteArray(
            record.routePatterns || record.routes || record.paths || record.endpoints,
          ),
          tags: toStringArray(record.tags),
          rawRef:
            (typeof record.url === 'string' && record.url) ||
            (typeof record.htmlUrl === 'string' && record.htmlUrl) ||
            null,
        };
      })
      .filter((entry): entry is PulseSignalDraft => Boolean(entry));
  }

  const monitors = asArray(data.monitors || data.incidents || data.endpoints)
    .map((entry) => asObject(entry))
    .filter(Boolean);
  return monitors
    .filter((monitor) => {
      const status = String(monitor.status || monitor.state || '').toLowerCase();
      return status && !['ok', 'healthy', 'pass', 'passed'].includes(status);
    })
    .map((monitor, index) => {
      const title =
        (typeof monitor.title === 'string' && monitor.title) ||
        (typeof monitor.name === 'string' && monitor.name) ||
        `Datadog incident ${index + 1}`;
      const type = /latency|p95|timeout|slow/i.test(title) ? 'latency_regression' : 'runtime_error';
      return {
        id:
          (typeof monitor.id === 'string' && monitor.id) ||
          (typeof monitor.monitorId === 'string' && monitor.monitorId) ||
          `datadog-${index}`,
        type,
        source: 'datadog' as const,
        truthMode: 'observed' as const,
        severity: normalizeScore(monitor.severity || monitor.priority, 0.82),
        impactScore: normalizeScore(
          monitor.impactScore || monitor.impact,
          type === 'latency_regression' ? 0.8 : 0.72,
        ),
        confidence: 0.9,
        summary: compact(title),
        observedAt: normalizeDate(
          monitor.updatedAt || monitor.timestamp || monitor.lastTriggeredAt,
        ),
        relatedFiles: normalizeFileArray(rootDir, monitor.files || monitor.relatedFiles),
        routePatterns: normalizeRouteArray(
          monitor.routes || monitor.paths || monitor.endpoints || monitor.resources,
        ),
        tags: toStringArray(monitor.tags),
        rawRef:
          (typeof monitor.url === 'string' && monitor.url) ||
          (typeof monitor.permalink === 'string' && monitor.permalink) ||
          null,
      };
    });
}

export function parsePrometheusSignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry): PulseSignalDraft | null => {
        const record = asObject(entry);
        if (!record) return null;
        return {
          id:
            (typeof record.id === 'string' && record.id.trim()) ||
            `prometheus:runtime_alert:${normalizeSummary(record.summary || record.message || record.title, 'Prometheus runtime signal.')}`,
          type: (typeof record.type === 'string' && record.type.trim()) || 'runtime_alert',
          source: 'prometheus' as const,
          truthMode: record.truthMode === 'inferred' ? 'inferred' : ('observed' as const),
          severity: normalizeScore(record.severity || record.level || record.priority, 0.5),
          impactScore: normalizeScore(record.impactScore || record.impact || record.weight, 0.55),
          confidence: normalizeScore(record.confidence, 0.8),
          summary: normalizeSummary(
            record.summary || record.message || record.title || record.description,
            'Prometheus runtime signal.',
          ),
          observedAt: normalizeDate(
            record.observedAt ||
              record.createdAt ||
              record.updatedAt ||
              record.occurredAt ||
              record.timestamp,
          ),
          relatedFiles: normalizeFileArray(rootDir, record.relatedFiles || record.files),
          routePatterns: normalizeRouteArray(
            record.routePatterns || record.routes || record.paths || record.endpoints,
          ),
          tags: [],
          rawRef:
            (typeof record.url === 'string' && record.url) ||
            (typeof record.htmlUrl === 'string' && record.htmlUrl) ||
            null,
        };
      })
      .filter((entry): entry is PulseSignalDraft => Boolean(entry));
  }

  const alerts = [
    ...asArray(data.alerts),
    ...asArray(data.firingAlerts),
    ...asArray(data.result),
    ...asArray(asObject(data.data)?.result),
  ]
    .map((entry) => asObject(entry))
    .filter(Boolean);

  return alerts
    .filter((alert) => {
      const status = String(alert.status || alert.state || alert.alertstate || 'firing')
        .toLowerCase()
        .trim();
      return !['ok', 'healthy', 'resolved', 'inactive'].includes(status);
    })
    .map((alert, index): PulseSignalDraft => {
      const labels = asObject(alert.labels) || asObject(alert.metric) || {};
      const alertName =
        (typeof labels.alertname === 'string' && labels.alertname) ||
        (typeof labels.alert === 'string' && labels.alert) ||
        (typeof alert.name === 'string' && alert.name) ||
        `prometheus-alert-${index + 1}`;
      const summary =
        (typeof alert.summary === 'string' && alert.summary) ||
        (typeof labels.summary === 'string' && labels.summary) ||
        (typeof alert.description === 'string' && alert.description) ||
        (typeof labels.description === 'string' && labels.description) ||
        alertName;
      const type = /queue|dlq|dead.?letter|backlog/i.test(summary)
        ? 'queue_backlog'
        : /latency|p95|timeout|slow/i.test(summary)
          ? 'latency_regression'
          : /error|failure|5xx|crash/i.test(summary)
            ? 'runtime_error'
            : 'runtime_alert';
      return {
        id:
          (typeof alert.id === 'string' && alert.id) ||
          (typeof alert.fingerprint === 'string' && alert.fingerprint) ||
          `prometheus:${alertName}:${index}`,
        type,
        source: 'prometheus' as const,
        truthMode: 'observed' as const,
        severity: normalizeScore(alert.severity || labels.severity || labels.priority, 0.82),
        impactScore: normalizeScore(alert.impactScore || alert.impact, 0.82),
        confidence: normalizeScore(alert.confidence, 0.88),
        summary: compact(summary),
        observedAt: normalizeDate(alert.activeAt || alert.startsAt || alert.updatedAt),
        relatedFiles: normalizeFileArray(rootDir, alert.files || alert.relatedFiles),
        routePatterns: normalizeRouteArray(
          alert.routes ||
            alert.paths ||
            alert.endpoints ||
            labels.route ||
            labels.path ||
            labels.endpoint,
        ),
        tags: toStringArray(alert.tags || labels.severity || labels.job || labels.instance),
        rawRef:
          (typeof alert.url === 'string' && alert.url) ||
          (typeof alert.generatorURL === 'string' && alert.generatorURL) ||
          null,
      };
    });
}
