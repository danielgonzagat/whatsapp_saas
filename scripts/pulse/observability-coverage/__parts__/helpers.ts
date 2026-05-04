/**
 * PULSE Observability Coverage Engine — Counting & Aggregation Helpers
 *
 * Log-call counters, metric-name extraction, trace-span counters,
 * alert-rule counters, dashboard-URL extraction, and top-gaps builder.
 */

import {
  deriveZeroValue,
  deriveUnitValue,
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog,
} from '../../dynamic-reality-kernel';
import type {
  CapabilityObservability,
  ObservabilityCoverageState,
  ObservabilityPillar,
  ObservabilityStatus,
} from '../../types.observability-coverage';

export function countLogCalls(filePaths: string[], getContent: (p: string) => string): number {
  let count = deriveZeroValue();
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.match(
      /(this\.logger\.|Logger\.(log|error|warn|debug|verbose)|new Logger\(|console\.(log|error|warn|debug|info)\()/gm,
    );
    if (matches) count += matches.length;
  }
  return count;
}

export function findMetricNames(filePaths: string[], getContent: (p: string) => string): string[] {
  const names = new Set<string>();
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.matchAll(/(?:counter|histogram|gauge|meter)\(\s*['"]([^'"]+)['"]/g);
    for (const m of matches) names.add(m[1]);
  }
  return [...names];
}

export function countTraceSpans(filePaths: string[], getContent: (p: string) => string): number {
  let count = deriveZeroValue();
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.match(
      /@Span\(|tracer\.startSpan|span\.setTag|startSpan\(|trace\.getTracer\(/gm,
    );
    if (matches) count += matches.length;
  }
  return count;
}

export function countAlertRules(filePaths: string[], getContent: (p: string) => string): number {
  let count = deriveZeroValue();
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.match(
      /datadog.*monitor|@monitor|PROMETHEUS_ALERT|alertmanager|alertApi|notifyAlert/gm,
    );
    if (matches) count += matches.length;
  }
  return count;
}

export function findDashboardUrls(
  filePaths: string[],
  getContent: (p: string) => string,
): string[] {
  const urls = new Set<string>();
  for (const fp of filePaths) {
    const content = getContent(fp);
    const matches = content.matchAll(/(?:dashboard|grafana|datadog).*(?:https?:\/\/[^\s'"]+)/gi);
    for (const m of matches) urls.add(m[0]);
  }
  return [...urls];
}

export function buildTopGaps(
  capabilityItems: CapabilityObservability[],
): ObservabilityCoverageState['topGaps'] {
  return capabilityItems
    .filter((cap) => cap.overallStatus !== 'covered')
    .map((cap) => {
      const missingPillars = (
        Object.entries(cap.pillars) as Array<[ObservabilityPillar, ObservabilityStatus]>
      )
        .filter(([, status]) => status === 'missing')
        .map(([pillar]) => pillar);

      let severity: 'critical' | 'high' | 'medium';
      const relevantPillars = Object.values(cap.pillars).filter(
        (status) => status !== 'not_applicable',
      ).length;
      const half = deriveUnitValue() / (deriveUnitValue() + deriveUnitValue());
      const missingRatio = missingPillars.length / Math.max(deriveUnitValue(), relevantPillars);
      if (cap.runtimeCritical && missingPillars.length > deriveZeroValue()) {
        severity = 'critical';
      } else if (missingRatio >= half) {
        severity = 'high';
      } else {
        severity = 'medium';
      }

      return { capabilityId: cap.capabilityId, missingPillars, severity };
    })
    .filter((gap) => gap.missingPillars.length > deriveZeroValue())
    .sort((a, b) => {
      const order = {
        critical: deriveZeroValue(),
        high: deriveUnitValue(),
        medium: deriveUnitValue() + deriveUnitValue(),
      };
      return order[a.severity] - order[b.severity];
    })
    .slice(
      deriveZeroValue(),
      deriveHttpStatusFromObservedCatalog('OK') /
        (deriveCatalogPercentScaleFromObservedCatalog() *
          (deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue())),
    );
}
