import {
  auditPulseNoHardcodedReality,
  type NoHardcodedRealityAuditResult,
} from './no-hardcoded-reality-audit';

export interface PulseNoHardcodedRealityEvent {
  eventName: string;
  evidence: string;
  filePath: string;
  line: number;
  column: number;
  samples: string[];
  truthMode: 'confirmed_static';
  actionability: 'replace_with_dynamic_discovery';
}

export interface PulseNoHardcodedRealityState {
  artifact: 'PULSE_NO_HARDCODED_REALITY';
  version: 1;
  generatedAt: string;
  operationalIdentity: 'dynamic_hardcode_evidence_event';
  scannedFiles: number;
  totalEvents: number;
  summary: NoHardcodedRealityAuditResult['summary'];
  hardcodeEvents: PulseNoHardcodedRealityEvent[];
  policy: {
    fixedClassifierIsOperationalTruth: false;
    regexCanDetectButCannotDecide: true;
    parserCanObserveButCannotCondemn: true;
    diagnosticMustBeGeneratedFromEvidence: true;
  };
}

export interface PulseNoHardcodedRealitySummary {
  totalEvents: number;
  scannedFiles: number;
  topFiles: string[];
  firstEvent: PulseNoHardcodedRealityEvent | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toHardcodedEvents(value: unknown): PulseNoHardcodedRealityEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is PulseNoHardcodedRealityEvent => {
    if (!isRecord(entry)) {
      return false;
    }
    return (
      typeof entry.eventName === 'string' &&
      typeof entry.evidence === 'string' &&
      typeof entry.filePath === 'string' &&
      typeof entry.line === 'number' &&
      typeof entry.column === 'number' &&
      Array.isArray(entry.samples)
    );
  });
}

function toSummaryTopFiles(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.topFiles)) {
    return [];
  }

  return value.topFiles
    .flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.filePath !== 'string') {
        return [];
      }
      return [entry.filePath];
    })
    .slice(0, 8);
}

export function buildPulseNoHardcodedRealityState(
  rootDir: string,
  generatedAt: string,
): PulseNoHardcodedRealityState {
  const audit = auditPulseNoHardcodedReality(rootDir);
  const hardcodeEvents = audit.findings.slice(0, 100).map((finding) => {
    const samples = finding.samples.join(', ');
    return {
      eventName: `Hardcoded reality candidate at ${finding.filePath}:${finding.line}`,
      evidence: `${finding.context}${samples ? ` -> ${samples}` : ''}`,
      filePath: finding.filePath,
      line: finding.line,
      column: finding.column,
      samples: finding.samples,
      truthMode: 'confirmed_static' as const,
      actionability: 'replace_with_dynamic_discovery' as const,
    };
  });

  return {
    artifact: 'PULSE_NO_HARDCODED_REALITY',
    version: 1,
    generatedAt,
    operationalIdentity: 'dynamic_hardcode_evidence_event',
    scannedFiles: audit.scannedFiles,
    totalEvents: audit.findings.length,
    summary: audit.summary,
    hardcodeEvents,
    policy: {
      fixedClassifierIsOperationalTruth: false,
      regexCanDetectButCannotDecide: true,
      parserCanObserveButCannotCondemn: true,
      diagnosticMustBeGeneratedFromEvidence: true,
    },
  };
}

export function summarizeNoHardcodedRealityState(state: unknown): PulseNoHardcodedRealitySummary {
  if (!isRecord(state)) {
    return {
      totalEvents: 0,
      scannedFiles: 0,
      topFiles: [],
      firstEvent: null,
    };
  }

  const hardcodeEvents = toHardcodedEvents(state.hardcodeEvents);
  const topFilesFromSummary = toSummaryTopFiles(state.summary);
  const topFiles =
    topFilesFromSummary.length > 0
      ? topFilesFromSummary
      : [...new Set(hardcodeEvents.map((event) => event.filePath))].slice(0, 8);

  return {
    totalEvents: toFiniteNumber(state.totalEvents),
    scannedFiles: toFiniteNumber(state.scannedFiles),
    topFiles,
    firstEvent: hardcodeEvents[0] ?? null,
  };
}

export function hasNoHardcodedRealityBlocker(summary: PulseNoHardcodedRealitySummary): boolean {
  return summary.totalEvents > 0;
}

export function formatNoHardcodedRealityBlocker(summary: PulseNoHardcodedRealitySummary): string {
  const files = summary.topFiles.length > 0 ? ` Top files: ${summary.topFiles.join(', ')}.` : '';
  const firstEvent = summary.firstEvent
    ? ` First event: ${summary.firstEvent.filePath}:${summary.firstEvent.line}.`
    : '';

  return `${summary.totalEvents} hardcoded reality event(s) across ${summary.scannedFiles} scanned PULSE file(s).${files}${firstEvent}`;
}
