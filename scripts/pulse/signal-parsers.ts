/**
 * Per-source signal parsers: github, github_actions, codecov, sentry, datadog, prometheus, dependabot.
 * Each parser accepts a rootDir + raw payload and returns PulseSignalDraft[].
 */
import type { PulseExternalSignalSource } from './types';
import {
  asObject,
  asArray,
  toStringArray,
  normalizeFileArray,
  normalizeRouteArray,
  normalizeDate,
  normalizeScore,
  normalizeSummary,
  normalizeExecutionMode,
  compact,
  unique,
} from './signal-normalizers';

export interface PulseSignalDraft {
  id: string;
  type: string;
  source: PulseExternalSignalSource;
  truthMode: 'observed' | 'inferred';
  executionMode?: import('./types').PulseScopeExecutionMode;
  severity: number;
  impactScore: number;
  confidence: number;
  summary: string;
  observedAt: string | null;
  relatedFiles: string[];
  routePatterns: string[];
  tags: string[];
  rawRef?: string | null;
}

export function normalizeSignalDraft(
  rootDir: string,
  source: PulseExternalSignalSource,
  raw: unknown,
  fallbackType: string,
  fallbackSummary: string,
): PulseSignalDraft | null {
  const record = asObject(raw);
  if (!record) return null;

  const relatedFiles = normalizeFileArray(
    rootDir,
    record.relatedFiles || record.files || record.changedFiles || record.stackFiles,
  );
  const routePatterns = normalizeRouteArray(
    record.routePatterns || record.routes || record.paths || record.endpoints,
  );
  const tags = unique(
    [
      ...toStringArray(record.tags || record.labels || record.categories),
      typeof record.category === 'string' ? record.category : '',
      typeof record.kind === 'string' ? record.kind : '',
    ].filter(Boolean),
  );

  const id =
    (typeof record.id === 'string' && record.id.trim()) ||
    (typeof record.issueId === 'string' && record.issueId.trim()) ||
    (typeof record.alertId === 'string' && record.alertId.trim()) ||
    (typeof record.runId === 'string' && record.runId.trim()) ||
    (typeof record.workflowRunId === 'string' && record.workflowRunId.trim()) ||
    (typeof record.commitSha === 'string' && record.commitSha.trim()) ||
    (typeof record.pullRequestId === 'string' && record.pullRequestId.trim()) ||
    `${source}:${fallbackType}:${normalizeSummary(record.summary || record.message || record.title, fallbackSummary)}`;

  return {
    id,
    type:
      (typeof record.type === 'string' && record.type.trim()) ||
      (typeof record.signalType === 'string' && record.signalType.trim()) ||
      (typeof record.kind === 'string' && record.kind.trim()) ||
      fallbackType,
    source,
    truthMode: record.truthMode === 'inferred' ? 'inferred' : ('observed' as const),
    executionMode: normalizeExecutionMode(record.executionMode || record.mode),
    severity: normalizeScore(record.severity || record.level || record.priority, 0.5),
    impactScore: normalizeScore(record.impactScore || record.impact || record.weight, 0.55),
    confidence: normalizeScore(record.confidence, 0.8),
    summary: normalizeSummary(
      record.summary || record.message || record.title || record.description,
      fallbackSummary,
    ),
    observedAt: normalizeDate(
      record.observedAt ||
        record.createdAt ||
        record.updatedAt ||
        record.occurredAt ||
        record.timestamp,
    ),
    relatedFiles,
    routePatterns,
    tags,
    rawRef:
      (typeof record.url === 'string' && record.url) ||
      (typeof record.htmlUrl === 'string' && record.htmlUrl) ||
      null,
  };
}

export function parseGithubSignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry) =>
        normalizeSignalDraft(rootDir, 'github', entry, 'recent_change', 'Recent GitHub change.'),
      )
      .filter((entry): entry is PulseSignalDraft => Boolean(entry));
  }

  const commits = asArray(data.commits)
    .map((entry) => asObject(entry))
    .filter(Boolean);
  const pullRequests = asArray(data.pullRequests || data.prs)
    .map((entry) => asObject(entry))
    .filter(Boolean);

  const commitSignals = commits.map((commit, index) => ({
    id:
      (typeof commit.sha === 'string' && commit.sha) ||
      (typeof commit.id === 'string' && commit.id) ||
      `github-commit-${index}`,
    type: 'recent_change',
    source: 'github' as const,
    truthMode: 'observed' as const,
    severity: 0.45,
    impactScore: 0.55,
    confidence: 0.8,
    summary: normalizeSummary(commit.message, 'Recent GitHub commit.'),
    observedAt: normalizeDate(commit.timestamp || commit.committedAt || commit.authoredAt),
    relatedFiles: normalizeFileArray(rootDir, commit.files || commit.changedFiles),
    routePatterns: normalizeRouteArray(commit.routes || commit.paths),
    tags: [],
    rawRef:
      (typeof commit.url === 'string' && commit.url) ||
      (typeof commit.htmlUrl === 'string' && commit.htmlUrl) ||
      null,
  }));

  const prSignals = pullRequests.map((pr, index) => {
    const merged = Boolean(pr.merged) || String(pr.state || '').toLowerCase() === 'merged';
    const failed = ['failure', 'failed', 'error'].includes(
      String(pr.conclusion || pr.status || '').toLowerCase(),
    );
    return {
      id:
        (typeof pr.id === 'string' && pr.id) ||
        (typeof pr.number === 'number' && `pr-${pr.number}`) ||
        `github-pr-${index}`,
      type: failed ? 'pull_request_failure' : merged ? 'pull_request_change' : 'pull_request',
      source: 'github' as const,
      truthMode: 'observed' as const,
      severity: failed ? 0.8 : 0.5,
      impactScore: failed ? 0.82 : merged ? 0.68 : 0.45,
      confidence: 0.82,
      summary: normalizeSummary(pr.title || pr.message, 'GitHub pull request signal.'),
      observedAt: normalizeDate(pr.updatedAt || pr.mergedAt || pr.createdAt),
      relatedFiles: normalizeFileArray(rootDir, pr.changedFiles || pr.files),
      routePatterns: normalizeRouteArray(pr.routes || pr.paths),
      tags: toStringArray(pr.labels),
      rawRef:
        (typeof pr.url === 'string' && pr.url) ||
        (typeof pr.htmlUrl === 'string' && pr.htmlUrl) ||
        null,
    };
  });

  return [...commitSignals, ...prSignals];
}

export function parseGithubActionsSignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry) =>
        normalizeSignalDraft(
          rootDir,
          'github_actions',
          entry,
          'build_failure',
          'GitHub Actions signal.',
        ),
      )
      .filter((entry): entry is PulseSignalDraft => Boolean(entry));
  }

  const runs = asArray(data.runs || data.workflowRuns || data.jobs)
    .map((entry) => asObject(entry))
    .filter(Boolean);

  return runs
    .filter((run) => {
      const conclusion = String(run.conclusion || run.status || '').toLowerCase();
      return conclusion && !['success', 'passed', 'completed'].includes(conclusion);
    })
    .map((run, index) => {
      const name = String(run.name || run.workflow || run.job || 'workflow run');
      const lowerName = name.toLowerCase();
      const type = lowerName.includes('deploy')
        ? 'deploy_failure'
        : lowerName.includes('coverage')
          ? 'coverage_regression'
          : lowerName.includes('test')
            ? 'test_regression'
            : 'build_failure';
      return {
        id:
          (typeof run.id === 'string' && run.id) ||
          (typeof run.runId === 'string' && run.runId) ||
          `actions-run-${index}`,
        type,
        source: 'github_actions' as const,
        truthMode: 'observed' as const,
        severity: 0.88,
        impactScore: type === 'deploy_failure' ? 0.92 : 0.78,
        confidence: 0.9,
        summary: compact(`${name} failed in GitHub Actions.`),
        observedAt: normalizeDate(run.updatedAt || run.createdAt || run.timestamp),
        relatedFiles: normalizeFileArray(rootDir, run.changedFiles || run.files),
        routePatterns: normalizeRouteArray(run.routes || run.paths),
        tags: [name],
        rawRef:
          (typeof run.url === 'string' && run.url) ||
          (typeof run.htmlUrl === 'string' && run.htmlUrl) ||
          null,
      };
    });
}

export function parseCodecovSignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry) =>
        normalizeSignalDraft(
          rootDir,
          'codecov',
          entry,
          'coverage_regression',
          'Codecov coverage regression.',
        ),
      )
      .filter((entry): entry is PulseSignalDraft => Boolean(entry));
  }

  const files = asArray(data.files || data.impacts)
    .map((entry) => asObject(entry))
    .filter(Boolean);
  return files
    .filter((file) => {
      const delta = Number(file.deltaCoverage ?? file.coverageDelta ?? file.delta ?? 0);
      return Number.isFinite(delta) && delta < 0;
    })
    .map((file, index) => {
      const filePath =
        (typeof file.filePath === 'string' && file.filePath) ||
        (typeof file.path === 'string' && file.path) ||
        `unknown-${index}`;
      const delta = Number(file.deltaCoverage ?? file.coverageDelta ?? file.delta ?? 0);
      return {
        id: `codecov:${filePath}`,
        type: 'coverage_regression',
        source: 'codecov' as const,
        truthMode: 'observed' as const,
        severity: 0.6,
        impactScore: Math.min(0.9, 0.45 + Math.abs(delta) / 100),
        confidence: 0.88,
        summary: compact(`Coverage regressed for ${filePath} (${delta} points).`),
        observedAt: normalizeDate(file.updatedAt || data.generatedAt || data.syncedAt),
        relatedFiles: [normalizeFileArray(rootDir, filePath)[0] || filePath],
        routePatterns: [],
        tags: [],
        rawRef: null,
      };
    });
}

export function parseSentrySignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry) =>
        normalizeSignalDraft(rootDir, 'sentry', entry, 'runtime_error', 'Sentry runtime signal.'),
      )
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
      .map((entry) =>
        normalizeSignalDraft(
          rootDir,
          'datadog',
          entry,
          'latency_regression',
          'Datadog runtime signal.',
        ),
      )
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
      .map((entry) =>
        normalizeSignalDraft(
          rootDir,
          'prometheus',
          entry,
          'runtime_alert',
          'Prometheus runtime signal.',
        ),
      )
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
    .map((alert, index) => {
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

export { parseDependabotSignals } from './signal-parsers-dependabot';
