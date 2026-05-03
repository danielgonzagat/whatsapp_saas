import { readFileSafe } from '../../parsers/utils';
import {
  containsSimulatedObservabilitySource,
  missingEvidence,
  findPillarByTerm,
} from './types-and-utils';
import type { PillarScanResult, ObservabilityRuntimeContext } from './types-and-utils';
import type {
  CapabilityObservability,
  FlowObservability,
  ObservabilityCoverageState,
  ObservabilityPillar,
  ObservabilityStatus,
} from '../../types.observability-coverage';
import { detectRuntimeIntegrationsWithoutObservability } from './integrations';

export function findHealthEndpointEvidence(filePaths: string[]): PillarScanResult {
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    const m = content.match(
      /@(Get|Head)\s*\(\s*['"](?:\/)?(healthz?|health\/detailed|ready)\s*['"]/i,
    );
    if (m) {
      return {
        status: 'observed',
        sourceKind: 'static_instrumentation',
        source: `health endpoint /${m[2]}`,
        reason: 'A concrete health endpoint is declared in capability-owned code.',
        filePaths: [filePath],
      };
    }
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated health-probe evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No health probe endpoint was found.');
}

export function findErrorBudgetEvidence(filePaths: string[]): PillarScanResult {
  const observedFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /\b(errorBudgetRemaining|errorBudget|error_budget|ERROR_BUDGET|sloTarget|sloThreshold|SLO_TARGET|SLO_THRESHOLD|serviceLevelObjective)\b/m.test(
        content,
      )
    ) {
      observedFiles.push(filePath);
    }
  }
  if (observedFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'error budget instrumentation',
      reason: 'Runtime-critical capability-owned code exposes explicit SLO/error-budget evidence.',
      filePaths: observedFiles,
    };
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated error-budget evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('Runtime-critical capabilities need explicit error-budget evidence.');
}

function scanForAlerts(filePaths: string[]): ObservabilityStatus {
  return scanForAlertsEvidence(filePaths).status;
}

export function scanForAlertsEvidence(filePaths: string[]): PillarScanResult {
  const observedFiles: string[] = [];
  const configurationFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /Sentry\.(captureException|captureMessage)|alertApi\.(send|post|create)|notifyAlert\(|sendAlert\(|webhook.*alert.*(send|post)/m.test(
        content,
      )
    ) {
      observedFiles.push(filePath);
    } else if (
      /datadog.*monitor|@monitor|PROMETHEUS_ALERT|alertmanager|uptime_kuma|better_uptime|OPS_WEBHOOK_URL|AUTOPILOT_ALERT_WEBHOOK_URL|DLQ_WEBHOOK_URL|webhook.*alert/m.test(
        content,
      )
    ) {
      configurationFiles.push(filePath);
    }
  }
  if (observedFiles.length > 0) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'alert dispatch instrumentation',
      reason: 'Alert dispatch code is present in capability-owned code.',
      filePaths: observedFiles,
    };
  }
  if (configurationFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'alerting configuration',
      reason: 'Alerting configuration exists, but no alert dispatch evidence was found.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated alerting evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No alerting evidence was found.');
}

export function findDashboardEvidence(filePaths: string[]): PillarScanResult {
  const catalogFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /grafana|kibana|splunk|datadog.*dashboard|dashboard.*url|bullboard|BullBoard|@BullBoard\(/m.test(
        content,
      )
    ) {
      catalogFiles.push(filePath);
    }
  }
  if (catalogFiles.length > 0) {
    return {
      status: 'partial',
      sourceKind: 'catalog',
      source: 'dashboard catalog',
      reason: 'Dashboard references are catalog/configuration, not observed runtime evidence.',
      filePaths: catalogFiles,
    };
  }
  if (simulatedFiles.length > 0) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated dashboard evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No dashboard catalog entry was found.');
}

export function countLogCalls(filePaths: string[], getContent: (p: string) => string): number {
  let count = 0;
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
  let count = 0;
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
  let count = 0;
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
      const missingRatio = missingPillars.length / Math.max(1, relevantPillars);
      if (cap.runtimeCritical && missingPillars.length > 0) {
        severity = 'critical';
      } else if (missingRatio >= 0.5) {
        severity = 'high';
      } else {
        severity = 'medium';
      }

      return { capabilityId: cap.capabilityId, missingPillars, severity };
    })
    .filter((gap) => gap.missingPillars.length > 0)
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, 20);
}

export function buildSummary(
  capabilityItems: CapabilityObservability[],
  flowItems: FlowObservability[],
  _topGaps: ObservabilityCoverageState['topGaps'],
  runtimeContext: ObservabilityRuntimeContext,
): ObservabilityCoverageState['summary'] {
  const allPerFileEntries = capabilityItems.flatMap((c) => c.details.perFileLogging);
  const uniqueFiles = new Set(allPerFileEntries.map((e) => e.filePath));
  const dedupedEntries = Array.from(uniqueFiles).map(
    (fp) => allPerFileEntries.find((e) => e.filePath === fp)!,
  );
  const alertPillar = findPillarByTerm(runtimeContext.pillars, 'alert');
  const tracingPillar = findPillarByTerm(runtimeContext.pillars, 'tracing');

  return {
    totalCapabilities: capabilityItems.length,
    fullyCoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'covered').length,
    partiallyCoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'partial')
      .length,
    uncoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'uncovered').length,
    totalFlows: flowItems.length,
    fullyCoveredFlows: flowItems.filter((f) => f.overallStatus === 'covered').length,
    criticalCapabilitiesWithoutAlerts: capabilityItems.filter(
      (c) =>
        alertPillar &&
        c.runtimeCritical &&
        c.pillars[alertPillar] === 'missing' &&
        c.overallStatus !== 'covered',
    ).length,
    criticalFlowsWithoutTracing: flowItems.filter(
      (f) =>
        tracingPillar && f.pillars[tracingPillar] === 'missing' && f.overallStatus !== 'covered',
    ).length,
    integrationsWithoutObservability: detectRuntimeIntegrationsWithoutObservability(
      capabilityItems,
      runtimeContext,
    ).length,
    capabilitiesWithComprehensiveLogging: capabilityItems.filter(
      (c) => c.logQuality === 'comprehensive',
    ).length,
    capabilitiesWithAdequateLogging: capabilityItems.filter((c) => c.logQuality === 'adequate')
      .length,
    capabilitiesWithMinimalLogging: capabilityItems.filter((c) => c.logQuality === 'minimal')
      .length,
    capabilitiesWithNoLogging: capabilityItems.filter((c) => c.logQuality === 'none').length,
    filesWithStructuredLogging: dedupedEntries.filter((e) => e.hasStructured).length,
    filesWithConsoleOnly: dedupedEntries.filter((e) => e.hasConsole && !e.hasStructured).length,
    filesWithNoLogging: dedupedEntries.filter((e) => e.noLogging).length,
    filesWithErrorLogging: dedupedEntries.filter((e) => e.hasErrorLogging).length,
    machineImprovementSignals: capabilityItems.reduce(
      (sum, item) => sum + item.machineImprovementSignals.length,
      0,
    ),
  };
}
