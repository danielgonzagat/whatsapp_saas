import type { PulseSignalDraft } from './signal-parsers';
import { normalizeSignalDraft } from './signal-parsers';
import {
  asArray,
  asObject,
  normalizeScore,
  compact,
  normalizeDate,
  normalizeFileArray,
  toStringArray,
} from './signal-normalizers';

export function parseDependabotSignals(
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
