import type { PulseExternalSignalSource } from './types.capabilities/01-primitives';
import {
  asObject,
  toStringArray,
  normalizeFileArray,
  normalizeRouteArray,
  normalizeDate,
  normalizeScore,
  normalizeSummary,
  normalizeExecutionMode,
  unique,
} from './signal-normalizers';

export interface PulseSignalDraft {
  id: string;
  type: string;
  source: PulseExternalSignalSource;
  truthMode: 'observed' | 'inferred';
  executionMode?: import('./types.truth').PulseScopeExecutionMode;
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

  const executionMode = normalizeExecutionMode(record.executionMode || record.mode);

  return {
    id,
    type:
      (typeof record.type === 'string' && record.type.trim()) ||
      (typeof record.signalType === 'string' && record.signalType.trim()) ||
      (typeof record.kind === 'string' && record.kind.trim()) ||
      fallbackType,
    source,
    truthMode: record.truthMode === 'inferred' ? 'inferred' : ('observed' as const),
    ...(executionMode !== undefined ? { executionMode } : {}),
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
