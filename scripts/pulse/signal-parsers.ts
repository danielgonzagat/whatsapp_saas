/**
 * Per-source signal parsers: github, github_actions, codecov, sentry, datadog, prometheus, dependabot.
 * Each parser accepts a rootDir + raw payload and returns PulseSignalDraft[].
 * Runtime parsers (sentry, datadog, prometheus) live in signal-parsers-runtime.ts.
 */
import type { PulseSignalDraft } from './signal-parsers.types';
import { normalizeSignalDraft } from './signal-parsers.types';
import {
  asObject,
  asArray,
  toStringArray,
  normalizeFileArray,
  normalizeRouteArray,
  normalizeDate,
  normalizeSummary,
  compact,
} from './signal-normalizers';

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
    .map((e) => asObject(e))
    .filter((e): e is Record<string, unknown> => Boolean(e));
  const pullRequests = asArray(data.pullRequests || data.prs)
    .map((e) => asObject(e))
    .filter((e): e is Record<string, unknown> => Boolean(e));
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
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

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
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
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

import { parseSentrySignals, parseDatadogSignals, parsePrometheusSignals } from './signal-parsers-runtime';
import { parseDependabotSignals } from './signal-parsers-dependabot';
export {
  parseSentrySignals,
  parseDatadogSignals,
  parsePrometheusSignals,
  parseDependabotSignals,
};
export { normalizeSignalDraft };
export type { PulseSignalDraft };
