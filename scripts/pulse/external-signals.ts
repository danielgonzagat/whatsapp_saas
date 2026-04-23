import * as path from 'path';
import type {
  PulseCapability,
  PulseCapabilityState,
  PulseCodacyEvidence,
  PulseConvergenceOwnerLane,
  PulseExternalAdapterSnapshot,
  PulseExternalSignalSource,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseScopeExecutionMode,
  PulseScopeFile,
  PulseScopeState,
  PulseSignal,
} from './types';
import type { ConsolidatedExternalState } from './adapters/external-sources-orchestrator';
import { pathExists, readTextFile } from './safe-fs';

interface BuildExternalSignalStateInput {
  rootDir: string;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  liveExternalState?: ConsolidatedExternalState | null;
}

interface PulseSignalDraft {
  id: string;
  type: string;
  source: PulseExternalSignalSource;
  truthMode: 'observed' | 'inferred';
  executionMode?: PulseScopeExecutionMode;
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

interface PulseExternalSourceConfig {
  fileName: string;
  maxAgeMinutes: number;
}

const S_RE = /\s+/g;
const WORD_RE = /[a-z0-9]+/g;

/** Pulse_external_snapshot_files. */
export const PULSE_EXTERNAL_SNAPSHOT_FILES: Record<
  Exclude<PulseExternalSignalSource, 'codacy'>,
  PulseExternalSourceConfig
> = {
  github: {
    fileName: 'PULSE_GITHUB_STATE.json',
    maxAgeMinutes: 6 * 60,
  },
  github_actions: {
    fileName: 'PULSE_GITHUB_ACTIONS_STATE.json',
    maxAgeMinutes: 6 * 60,
  },
  codecov: {
    fileName: 'PULSE_CODECOV_STATE.json',
    maxAgeMinutes: 24 * 60,
  },
  sentry: {
    fileName: 'PULSE_SENTRY_STATE.json',
    maxAgeMinutes: 6 * 60,
  },
  datadog: {
    fileName: 'PULSE_DATADOG_STATE.json',
    maxAgeMinutes: 6 * 60,
  },
  prometheus: {
    fileName: 'PULSE_PROMETHEUS_STATE.json',
    maxAgeMinutes: 30,
  },
  dependabot: {
    fileName: 'PULSE_DEPENDABOT_STATE.json',
    maxAgeMinutes: 24 * 60,
  },
};

/** Pulse_external_input_files. */
export const PULSE_EXTERNAL_INPUT_FILES = [
  'PULSE_CODACY_STATE.json',
  ...Object.values(PULSE_EXTERNAL_SNAPSHOT_FILES).map((config) => config.fileName),
];

function compact(value: string, max: number = 240): string {
  const normalized = value.replace(S_RE, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  return unique(
    asArray(value)
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
}

function normalizePathValue(rootDir: string, value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) {
    return normalized;
  }

  if (path.isAbsolute(normalized)) {
    const relative = path.relative(rootDir, normalized);
    if (relative && !relative.startsWith('..')) {
      return relative.replace(/\\/g, '/');
    }
  }

  return normalized.replace(/^\.\/+/, '');
}

function normalizeFileArray(rootDir: string, value: unknown): string[] {
  return unique(
    [
      ...toStringArray(value),
      ...asArray(value)
        .map((entry) => asObject(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .flatMap((entry) =>
          [entry.path, entry.file, entry.filePath]
            .map((candidate) => (typeof candidate === 'string' ? candidate : ''))
            .filter(Boolean),
        ),
    ]
      .map((entry) => normalizePathValue(rootDir, entry))
      .filter(Boolean),
  );
}

function normalizeRoutePattern(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase() || '/';
}

function normalizeRouteArray(value: unknown): string[] {
  return unique(
    [
      ...toStringArray(value),
      ...asArray(value)
        .map((entry) => asObject(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .flatMap((entry) =>
          [entry.route, entry.path, entry.endpoint]
            .map((candidate) => (typeof candidate === 'string' ? candidate : ''))
            .filter(Boolean),
        ),
    ]
      .map((entry) => normalizeRoutePattern(entry))
      .filter(Boolean),
  );
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

function severityFromString(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.includes('critical') ||
    normalized.includes('fatal') ||
    normalized.includes('blocker')
  ) {
    return 1;
  }
  if (normalized.includes('high') || normalized.includes('error')) {
    return 0.85;
  }
  if (normalized.includes('medium') || normalized.includes('warn')) {
    return 0.6;
  }
  if (normalized.includes('low') || normalized.includes('info')) {
    return 0.35;
  }
  return 0.5;
}

function normalizeScore(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 1 && value >= 0) {
      return Math.round(value * 100) / 100;
    }
    if (value > 1 && value <= 10) {
      return Math.round((value / 10) * 100) / 100;
    }
    if (value > 10 && value <= 100) {
      return Math.round((value / 100) * 100) / 100;
    }
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return normalizeScore(parsed, fallback);
    }
    return severityFromString(value);
  }
  return fallback;
}

function normalizeSummary(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return compact(value);
  }
  return compact(fallback);
}

function normalizeExecutionMode(value: unknown): PulseScopeExecutionMode | undefined {
  return value === 'ai_safe' || value === 'human_required' || value === 'observation_only'
    ? value
    : undefined;
}

function normalizeSignalDraft(
  rootDir: string,
  source: PulseExternalSignalSource,
  raw: unknown,
  fallbackType: string,
  fallbackSummary: string,
): PulseSignalDraft | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

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

function routeMatches(left: string, right: string): boolean {
  const leftNormalized = normalizeRoutePattern(left);
  const rightNormalized = normalizeRoutePattern(right);
  return (
    leftNormalized === rightNormalized ||
    leftNormalized.startsWith(rightNormalized) ||
    rightNormalized.startsWith(leftNormalized)
  );
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(WORD_RE) || [];
}

function normalizedFileMatch(left: string, right: string): boolean {
  const leftNormalized = left.replace(/\\/g, '/');
  const rightNormalized = right.replace(/\\/g, '/');
  return (
    leftNormalized === rightNormalized ||
    leftNormalized.endsWith(`/${rightNormalized}`) ||
    rightNormalized.endsWith(`/${leftNormalized}`)
  );
}

function buildCapabilityTerms(capability: PulseCapability): string[] {
  return unique(
    tokenize([capability.id, capability.name, ...capability.routePatterns].join(' ')).filter(
      (entry) => entry.length >= 4,
    ),
  );
}

function buildFlowTerms(flow: PulseFlowProjectionItem): string[] {
  return unique(
    tokenize([flow.id, flow.name, ...flow.routePatterns].join(' ')).filter(
      (entry) => entry.length >= 4,
    ),
  );
}

function buildCodacySignalDrafts(
  codacyEvidence: PulseCodacyEvidence,
  rootDir: string,
): PulseSignalDraft[] {
  return codacyEvidence.hotspots
    .filter((hotspot) => hotspot.highSeverityCount > 0)
    .slice(0, 20)
    .map((hotspot) => ({
      id: `codacy:${hotspot.filePath}`,
      type: 'static_hotspot',
      source: 'codacy' as const,
      truthMode: 'observed' as const,
      severity: hotspot.highSeverityCount > 2 ? 0.9 : 0.75,
      impactScore: hotspot.runtimeCritical ? 0.8 : hotspot.userFacing ? 0.7 : 0.55,
      confidence: 0.95,
      summary: compact(
        `${hotspot.highSeverityCount} HIGH Codacy issue(s) remain in ${hotspot.filePath}.`,
      ),
      observedAt: codacyEvidence.generatedAt,
      relatedFiles: [normalizePathValue(rootDir, hotspot.filePath)],
      routePatterns: [],
      tags: [...hotspot.categories, ...hotspot.tools],
      rawRef: null,
    }));
}

function parseGithubSignals(rootDir: string, data: Record<string, unknown>): PulseSignalDraft[] {
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

function parseGithubActionsSignals(
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

function parseCodecovSignals(rootDir: string, data: Record<string, unknown>): PulseSignalDraft[] {
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
        relatedFiles: [normalizePathValue(rootDir, filePath)],
        routePatterns: [],
        tags: [],
        rawRef: null,
      };
    });
}

function parseSentrySignals(rootDir: string, data: Record<string, unknown>): PulseSignalDraft[] {
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

function parseDatadogSignals(rootDir: string, data: Record<string, unknown>): PulseSignalDraft[] {
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

function parsePrometheusSignals(
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

function parseDependabotSignals(
  rootDir: string,
  data: Record<string, unknown>,
): PulseSignalDraft[] {
  if (Array.isArray(data.signals)) {
    return data.signals
      .map((entry) =>
        normalizeSignalDraft(
          rootDir,
          'dependabot',
          entry,
          'dependency_risk',
          'Dependabot dependency alert.',
        ),
      )
      .filter((entry): entry is PulseSignalDraft => Boolean(entry));
  }

  const alerts = asArray(data.alerts || data.vulnerabilities)
    .map((entry) => asObject(entry))
    .filter(Boolean);
  return alerts
    .filter((alert) => String(alert.state || 'open').toLowerCase() !== 'dismissed')
    .map((alert, index) => {
      const pkg =
        (typeof alert.packageName === 'string' && alert.packageName) ||
        (typeof alert.package === 'string' && alert.package) ||
        `dependency-${index + 1}`;
      return {
        id:
          (typeof alert.id === 'string' && alert.id) ||
          (typeof alert.alertId === 'string' && alert.alertId) ||
          `dependabot-${index}`,
        type: 'dependency_risk',
        source: 'dependabot' as const,
        truthMode: 'observed' as const,
        severity: normalizeScore(alert.severity || alert.level, 0.78),
        impactScore: normalizeScore(alert.impactScore || alert.impact, 0.65),
        confidence: 0.9,
        summary: compact(
          `${pkg} has an open dependency alert${typeof alert.summary === 'string' ? `: ${alert.summary}` : '.'}`,
        ),
        observedAt: normalizeDate(alert.updatedAt || alert.createdAt || data.generatedAt),
        relatedFiles: normalizeFileArray(rootDir, alert.files || alert.manifests),
        routePatterns: [],
        tags: toStringArray(alert.tags || alert.ecosystems),
        rawRef:
          (typeof alert.url === 'string' && alert.url) ||
          (typeof alert.htmlUrl === 'string' && alert.htmlUrl) ||
          null,
      };
    });
}

function readSnapshot(
  rootDir: string,
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
): { sourcePath: string; payload: Record<string, unknown> | null; error?: string } {
  const sourcePath = path.join(rootDir, PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName);
  if (!pathExists(sourcePath)) {
    return { sourcePath, payload: null };
  }

  try {
    const payload = JSON.parse(readTextFile(sourcePath, 'utf8')) as Record<string, unknown>;
    return { sourcePath, payload };
  } catch (error) {
    return {
      sourcePath,
      payload: null,
      error: error instanceof Error ? error.message : 'Invalid JSON payload.',
    };
  }
}

function buildCapabilityIndexes(capabilities: PulseCapability[]) {
  return capabilities.map((capability) => ({
    capability,
    filePaths: new Set(capability.filePaths.map((entry) => entry.replace(/\\/g, '/'))),
    routePatterns: capability.routePatterns.map((entry) => normalizeRoutePattern(entry)),
    terms: buildCapabilityTerms(capability),
  }));
}

function buildFlowIndexes(flows: PulseFlowProjectionItem[]) {
  return flows.map((flow) => ({
    flow,
    routePatterns: flow.routePatterns.map((entry) => normalizeRoutePattern(entry)),
    terms: buildFlowTerms(flow),
  }));
}

function selectLane(values: PulseConvergenceOwnerLane[]): PulseConvergenceOwnerLane {
  if (values.includes('customer')) {
    return 'customer';
  }
  if (values.includes('security')) {
    return 'security';
  }
  if (values.includes('operator-admin')) {
    return 'operator-admin';
  }
  if (values.includes('reliability')) {
    return 'reliability';
  }
  return 'platform';
}

function isDependencySignal(signal: Pick<PulseSignal, 'source' | 'type'>): boolean {
  return signal.source === 'dependabot' || /dependency|vuln|supply/i.test(signal.type);
}

function isChangeSignal(signal: Pick<PulseSignal, 'source' | 'type'>): boolean {
  return (
    signal.source === 'github' ||
    signal.source === 'github_actions' ||
    signal.source === 'codecov' ||
    /change|build|deploy|test|coverage/i.test(signal.type)
  );
}

function isRuntimeSignal(signal: Pick<PulseSignal, 'source' | 'type'>): boolean {
  return (
    signal.source === 'sentry' ||
    signal.source === 'datadog' ||
    signal.source === 'prometheus' ||
    /runtime|latency|error|incident|timeout/i.test(signal.type)
  );
}

function buildSignalState(
  drafts: PulseSignalDraft[],
  input: BuildExternalSignalStateInput,
): PulseSignal[] {
  const capabilityIndexes = buildCapabilityIndexes(input.capabilityState.capabilities);
  const flowIndexes = buildFlowIndexes(input.flowProjection.flows);
  const scopeFilesByPath = new Map(
    input.scopeState.files.map((file) => [file.path.replace(/\\/g, '/'), file] as const),
  );

  const mappedSignals = drafts.map((draft) => {
    const summaryTerms = unique(tokenize([draft.summary, ...draft.tags].join(' '))).filter(
      (entry) => entry.length >= 4,
    );
    const hasDirectStructuralTarget =
      draft.relatedFiles.length > 0 || draft.routePatterns.length > 0;
    const changeSignal = isChangeSignal({ source: draft.source, type: draft.type });
    const allowTermMatch = hasDirectStructuralTarget || !changeSignal;
    const capabilityMatches = capabilityIndexes
      .filter((entry) => {
        const fileMatch = draft.relatedFiles.some((filePath) =>
          [...entry.filePaths].some((candidate) => normalizedFileMatch(candidate, filePath)),
        );
        const routeMatch = draft.routePatterns.some((routePattern) =>
          entry.routePatterns.some((candidate) => routeMatches(candidate, routePattern)),
        );
        const termMatch = allowTermMatch && summaryTerms.some((term) => entry.terms.includes(term));
        return fileMatch || routeMatch || termMatch;
      })
      .map((entry) => entry.capability);

    const flowMatches = flowIndexes
      .filter((entry) => {
        const routeMatch = draft.routePatterns.some((routePattern) =>
          entry.routePatterns.some((candidate) => routeMatches(candidate, routePattern)),
        );
        const capabilityMatch = entry.flow.capabilityIds.some((capabilityId) =>
          capabilityMatches.some((capability) => capability.id === capabilityId),
        );
        const termMatch = allowTermMatch && summaryTerms.some((term) => entry.terms.includes(term));
        return routeMatch || capabilityMatch || termMatch;
      })
      .map((entry) => entry.flow);

    const relatedScopeFiles = unique(
      draft.relatedFiles
        .flatMap((filePath) =>
          input.scopeState.files.filter((file) => normalizedFileMatch(file.path, filePath)),
        )
        .map((file) => file.path),
    )
      .map((filePath) => scopeFilesByPath.get(filePath))
      .filter((file): file is PulseScopeFile => Boolean(file));

    const protectedByGovernance =
      capabilityMatches.some((capability) => capability.protectedByGovernance) ||
      relatedScopeFiles.some((file) => file.protectedByGovernance);

    const executionMode: PulseScopeExecutionMode = protectedByGovernance
      ? 'human_required'
      : draft.executionMode === 'human_required'
        ? 'human_required'
        : capabilityMatches.some((capability) => capability.executionMode === 'human_required') ||
            relatedScopeFiles.some((file) => file.executionMode === 'human_required')
          ? 'human_required'
          : draft.executionMode === 'observation_only' ||
              (changeSignal && !hasDirectStructuralTarget)
            ? 'observation_only'
            : capabilityMatches.length === 0 && flowMatches.length === 0 && draft.impactScore >= 0.7
              ? 'observation_only'
              : 'ai_safe';

    const ownerLane = selectLane(
      [
        ...capabilityMatches.map((capability) => capability.ownerLane),
        ...relatedScopeFiles.map((file) => file.ownerLane),
        isDependencySignal({ source: draft.source, type: draft.type }) ? 'security' : null,
        isRuntimeSignal({ source: draft.source, type: draft.type }) ? 'reliability' : null,
        draft.routePatterns.length > 0 ? 'customer' : null,
        'platform',
      ].filter(Boolean) as PulseConvergenceOwnerLane[],
    );

    return {
      ...draft,
      severity: Math.max(0, Math.min(1, draft.severity)),
      impactScore: Math.max(0, Math.min(1, draft.impactScore)),
      confidence: Math.max(0, Math.min(1, draft.confidence)),
      capabilityIds: unique(capabilityMatches.map((capability) => capability.id)),
      flowIds: unique(flowMatches.map((flow) => flow.id)),
      recentChangeRefs: [],
      ownerLane,
      executionMode,
      protectedByGovernance,
      validationTargets: unique(
        [
          'PULSE_EXTERNAL_SIGNAL_STATE.json',
          'PULSE_CERTIFICATE.json',
          capabilityMatches.length > 0 ? 'PULSE_CAPABILITY_STATE.json' : null,
          flowMatches.length > 0 ? 'PULSE_FLOW_PROJECTION.json' : null,
        ].filter(Boolean) as string[],
      ),
    } satisfies PulseSignal;
  });

  const merged = new Map<string, PulseSignal>();
  for (const signal of mappedSignals) {
    const key = [
      signal.source,
      signal.type,
      signal.summary.toLowerCase(),
      signal.relatedFiles.join('|'),
      signal.routePatterns.join('|'),
    ].join('::');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, signal);
      continue;
    }
    merged.set(key, {
      ...existing,
      severity: Math.max(existing.severity, signal.severity),
      impactScore: Math.max(existing.impactScore, signal.impactScore),
      confidence: Math.max(existing.confidence, signal.confidence),
      relatedFiles: unique([...existing.relatedFiles, ...signal.relatedFiles]),
      routePatterns: unique([...existing.routePatterns, ...signal.routePatterns]),
      tags: unique([...existing.tags, ...signal.tags]),
      capabilityIds: unique([...existing.capabilityIds, ...signal.capabilityIds]),
      flowIds: unique([...existing.flowIds, ...signal.flowIds]),
      recentChangeRefs: unique([...existing.recentChangeRefs, ...signal.recentChangeRefs]),
      validationTargets: unique([...existing.validationTargets, ...signal.validationTargets]),
      protectedByGovernance: existing.protectedByGovernance || signal.protectedByGovernance,
      executionMode:
        existing.executionMode === 'human_required' || signal.executionMode === 'human_required'
          ? 'human_required'
          : existing.executionMode === 'observation_only' ||
              signal.executionMode === 'observation_only'
            ? 'observation_only'
            : 'ai_safe',
    });
  }

  return [...merged.values()].sort(
    (left, right) =>
      right.impactScore - left.impactScore ||
      right.severity - left.severity ||
      left.id.localeCompare(right.id),
  );
}

function attachRecentChangeRefs(signals: PulseSignal[]): PulseSignal[] {
  const changeSignals = signals.filter((signal) => signal.source === 'github');
  if (changeSignals.length === 0) {
    return signals;
  }

  return signals.map((signal) => {
    if (signal.source === 'github') {
      return signal;
    }

    const recentChangeRefs = changeSignals
      .filter((change) => {
        const fileOverlap =
          signal.relatedFiles.length > 0 &&
          change.relatedFiles.some((filePath) =>
            signal.relatedFiles.some((candidate) => normalizedFileMatch(candidate, filePath)),
          );
        const routeOverlap =
          signal.routePatterns.length > 0 &&
          change.routePatterns.some((routePattern) =>
            signal.routePatterns.some((candidate) => routeMatches(candidate, routePattern)),
          );
        const capabilityOverlap =
          signal.capabilityIds.length > 0 &&
          change.capabilityIds.some((capabilityId) => signal.capabilityIds.includes(capabilityId));
        return fileOverlap || routeOverlap || capabilityOverlap;
      })
      .map((change) => change.id);

    return {
      ...signal,
      recentChangeRefs: unique([...signal.recentChangeRefs, ...recentChangeRefs]),
    };
  });
}

function buildSnapshotAdapter(
  input: BuildExternalSignalStateInput,
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
): PulseExternalAdapterSnapshot {
  const snapshot = readSnapshot(input.rootDir, source);
  if (snapshot.error) {
    return {
      source,
      sourcePath: snapshot.sourcePath,
      executed: true,
      status: 'invalid',
      generatedAt: new Date().toISOString(),
      syncedAt: null,
      freshnessMinutes: null,
      reason: compact(snapshot.error),
      signals: [],
    };
  }

  if (!snapshot.payload) {
    return {
      source,
      sourcePath: snapshot.sourcePath,
      executed: false,
      status: 'not_available',
      generatedAt: new Date().toISOString(),
      syncedAt: null,
      freshnessMinutes: null,
      reason: `${PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName} is not available in the repository root.`,
      signals: [],
    };
  }

  const payload = snapshot.payload;
  const syncedAt = normalizeDate(payload.syncedAt || payload.generatedAt || payload.updatedAt);
  const freshnessMinutes =
    syncedAt !== null
      ? Math.max(0, Math.round((Date.now() - Date.parse(syncedAt)) / 60_000))
      : null;
  const stale =
    freshnessMinutes !== null &&
    freshnessMinutes > PULSE_EXTERNAL_SNAPSHOT_FILES[source].maxAgeMinutes;

  const drafts =
    source === 'github'
      ? parseGithubSignals(input.rootDir, payload)
      : source === 'github_actions'
        ? parseGithubActionsSignals(input.rootDir, payload)
        : source === 'codecov'
          ? parseCodecovSignals(input.rootDir, payload)
          : source === 'sentry'
            ? parseSentrySignals(input.rootDir, payload)
            : source === 'datadog'
              ? parseDatadogSignals(input.rootDir, payload)
              : source === 'prometheus'
                ? parsePrometheusSignals(input.rootDir, payload)
                : parseDependabotSignals(input.rootDir, payload);

  const signals = buildSignalState(drafts, input);

  return {
    source,
    sourcePath: snapshot.sourcePath,
    executed: true,
    status: stale ? 'stale' : 'ready',
    generatedAt: new Date().toISOString(),
    syncedAt,
    freshnessMinutes,
    reason: stale
      ? `${PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName} is stale (${freshnessMinutes} minute(s) old).`
      : signals.length > 0
        ? `${signals.length} normalized ${source} signal(s) are available.`
        : `${PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName} is present but did not yield actionable signals.`,
    signals,
  };
}

function buildLiveAdapter(
  input: BuildExternalSignalStateInput,
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
): PulseExternalAdapterSnapshot | null {
  const liveState = input.liveExternalState;
  if (!liveState) {
    return null;
  }

  const sourceState = liveState.sources.find((entry) => entry.source === source);
  if (!sourceState) {
    return null;
  }

  const drafts = (liveState.signalsBySource[source] || [])
    .map((signal) =>
      normalizeSignalDraft(
        input.rootDir,
        source,
        signal,
        signal.type || `${source}_signal`,
        signal.summary || `${source} live adapter signal`,
      ),
    )
    .filter((draft): draft is PulseSignalDraft => Boolean(draft));
  const signals = buildSignalState(drafts, input);

  return {
    source,
    sourcePath: `live:${source}`,
    executed: sourceState.status !== 'not_available',
    status: sourceState.status,
    generatedAt: liveState.generatedAt,
    syncedAt: sourceState.syncedAt,
    freshnessMinutes: 0,
    reason: sourceState.reason,
    signals,
  };
}

function selectExternalAdapter(
  snapshotAdapter: PulseExternalAdapterSnapshot,
  liveAdapter: PulseExternalAdapterSnapshot | null,
): PulseExternalAdapterSnapshot {
  if (!liveAdapter) {
    return snapshotAdapter;
  }

  if (liveAdapter.status === 'ready') {
    return liveAdapter;
  }

  if (snapshotAdapter.status !== 'not_available') {
    return {
      ...snapshotAdapter,
      reason: `${liveAdapter.reason} Snapshot fallback is active. ${snapshotAdapter.reason}`,
    };
  }

  return liveAdapter;
}

function buildCodacyAdapter(input: BuildExternalSignalStateInput): PulseExternalAdapterSnapshot {
  const syncedAt = input.scopeState.codacy.syncedAt;
  const drafts = buildCodacySignalDrafts(input.codacyEvidence, input.rootDir);
  return {
    source: 'codacy',
    sourcePath: input.scopeState.codacy.sourcePath,
    executed: input.scopeState.codacy.snapshotAvailable,
    status: !input.scopeState.codacy.snapshotAvailable
      ? 'not_available'
      : input.scopeState.codacy.stale
        ? 'stale'
        : 'ready',
    generatedAt: new Date().toISOString(),
    syncedAt,
    freshnessMinutes: input.scopeState.codacy.ageMinutes,
    reason: !input.scopeState.codacy.snapshotAvailable
      ? 'PULSE_CODACY_STATE.json is not available.'
      : input.scopeState.codacy.stale
        ? `PULSE_CODACY_STATE.json is stale (${input.scopeState.codacy.ageMinutes} minute(s) old).`
        : `${drafts.length} Codacy hotspot signal(s) were normalized from the latest snapshot.`,
    signals: buildSignalState(drafts, input),
  };
}

/** Build normalized external-signal state from snapshot-first adapters. */
export function buildExternalSignalState(
  input: BuildExternalSignalStateInput,
): PulseExternalSignalState {
  const externalSources: Array<Exclude<PulseExternalSignalSource, 'codacy'>> = [
    'github',
    'github_actions',
    'codecov',
    'sentry',
    'datadog',
    'prometheus',
    'dependabot',
  ];
  const initialAdapters: PulseExternalAdapterSnapshot[] = [
    buildCodacyAdapter(input),
    ...externalSources.map((source) =>
      selectExternalAdapter(buildSnapshotAdapter(input, source), buildLiveAdapter(input, source)),
    ),
  ];

  const signals = attachRecentChangeRefs(initialAdapters.flatMap((adapter) => adapter.signals));
  const adapters = initialAdapters.map((adapter) => ({
    ...adapter,
    signals: signals.filter((signal) => signal.source === adapter.source),
  }));
  const summary = {
    totalSignals: signals.length,
    runtimeSignals: signals.filter(isRuntimeSignal).length,
    changeSignals: signals.filter(isChangeSignal).length,
    dependencySignals: signals.filter(isDependencySignal).length,
    highImpactSignals: signals.filter((signal) => signal.impactScore >= 0.8).length,
    mappedSignals: signals.filter(
      (signal) => signal.capabilityIds.length > 0 || signal.flowIds.length > 0,
    ).length,
    humanRequiredSignals: signals.filter((signal) => signal.executionMode === 'human_required')
      .length,
    staleAdapters: adapters.filter((adapter) => adapter.status === 'stale').length,
    missingAdapters: adapters.filter((adapter) => adapter.status === 'not_available').length,
    bySource: {
      github: signals.filter((signal) => signal.source === 'github').length,
      github_actions: signals.filter((signal) => signal.source === 'github_actions').length,
      codacy: signals.filter((signal) => signal.source === 'codacy').length,
      codecov: signals.filter((signal) => signal.source === 'codecov').length,
      sentry: signals.filter((signal) => signal.source === 'sentry').length,
      datadog: signals.filter((signal) => signal.source === 'datadog').length,
      prometheus: signals.filter((signal) => signal.source === 'prometheus').length,
      dependabot: signals.filter((signal) => signal.source === 'dependabot').length,
    },
  };

  return {
    generatedAt: new Date().toISOString(),
    truthMode: 'observed',
    summary,
    adapters,
    signals,
  };
}
