import * as path from 'path';
import { pathExists, readTextFile } from './safe-fs';
import { safeJoin } from './lib/safe-path';
import type {
  PulseCodacyHotspot,
  PulseCodacyIssue,
  PulseCodacySeverity,
  PulseCodacySummary,
} from './types';

/**
 * Codacy-snapshot ingestion for `scope-state.ts`.
 *
 * Extracted as a sibling so the parent module stays under the 600-line
 * touched-file cap. The exported helpers preserve their previous behaviour
 * exactly, including JSON parse fallbacks and severity normalisation.
 */

/** Normalise an OS path to forward-slash form, dropping any leading `./`. */
export function normalizePath(input: string): string {
  const normalized = input.split(path.sep).join('/').split('\\').join('/');
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

/** Coerce an arbitrary severity string into the PulseCodacySeverity enum. */
export function normalizeSeverity(value: string | undefined | null): PulseCodacySeverity {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return normalized;
  }
  return 'UNKNOWN';
}

/** Deduplicate non-empty strings and return them in lexicographic order. */
export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

/** Compute the integer age in minutes for an ISO timestamp, or null if unparseable. */
function ageMinutesFromIso(syncedAt: string | null): number | null {
  if (!syncedAt) return null;
  const parsed = Date.parse(syncedAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((Date.now() - parsed) / 60000);
}

/** Stale flag: missing age is stale; otherwise stale when older than 24h. */
function isStale(ageMinutes: number | null): boolean {
  if (ageMinutes === null) return true;
  return ageMinutes > 24 * 60;
}

/** Build an empty PulseCodacySummary used when no snapshot is available. */
function emptyCodacySummary(sourcePath: string | null): PulseCodacySummary {
  return {
    snapshotAvailable: false,
    sourcePath,
    syncedAt: null,
    ageMinutes: null,
    stale: true,
    loc: 0,
    totalIssues: 0,
    severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
    toolCounts: {},
    topFiles: [],
    highPriorityBatch: [],
    observedFiles: [],
  };
}

/**
 * Build the PulseCodacySummary for a repository root by reading the cached
 * `PULSE_CODACY_STATE.json` snapshot.
 */
export function buildCodacySummary(rootDir: string): PulseCodacySummary {
  const sourcePath = safeJoin(rootDir, 'PULSE_CODACY_STATE.json');
  if (!pathExists(sourcePath)) {
    return emptyCodacySummary(null);
  }

  try {
    const parsed = JSON.parse(readTextFile(sourcePath, 'utf8')) as Record<string, unknown>;
    const syncedAt = typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null;
    const ageMinutes = ageMinutesFromIso(syncedAt);

    const highPriorityBatch = Array.isArray(parsed.highPriorityBatch)
      ? parsed.highPriorityBatch.map((entry) => {
          const record = entry as Record<string, unknown>;
          return {
            issueId: String(record.issueId || ''),
            filePath: normalizePath(String(record.filePath || '')),
            lineNumber: Number(record.lineNumber || 1),
            patternId: String(record.patternId || ''),
            category: String(record.category || ''),
            severityLevel: normalizeSeverity(String(record.severityLevel || 'UNKNOWN')),
            tool: String(record.tool || ''),
            message: String(record.message || ''),
            commitSha: record.commitSha ? String(record.commitSha) : null,
            commitTimestamp: record.commitTimestamp ? String(record.commitTimestamp) : null,
          } satisfies PulseCodacyIssue;
        })
      : [];

    const highPriorityByFile = new Map<string, PulseCodacyIssue[]>();
    for (const issue of highPriorityBatch) {
      if (!highPriorityByFile.has(issue.filePath)) {
        highPriorityByFile.set(issue.filePath, []);
      }
      highPriorityByFile.get(issue.filePath)!.push(issue);
    }

    const topFiles = Array.isArray(parsed.topFiles)
      ? parsed.topFiles.map((entry) => {
          const record = entry as Record<string, unknown>;
          const filePath = normalizePath(String(record.file || ''));
          const issues = highPriorityByFile.get(filePath) || [];
          return {
            filePath,
            issueCount: Number(record.count || 0),
            highestSeverity:
              issues.find((issue) => issue.severityLevel === 'HIGH')?.severityLevel || 'UNKNOWN',
            categories: uniqueStrings(issues.map((issue) => issue.category)),
            tools: uniqueStrings(issues.map((issue) => issue.tool)),
            highSeverityCount: issues.filter((issue) => issue.severityLevel === 'HIGH').length,
          } satisfies PulseCodacyHotspot;
        })
      : [];

    return {
      snapshotAvailable: true,
      sourcePath,
      syncedAt,
      ageMinutes,
      stale: isStale(ageMinutes),
      loc: Number((parsed.repositorySummary as Record<string, unknown> | undefined)?.loc || 0),
      totalIssues: Number(parsed.totalIssues || 0),
      severityCounts: {
        HIGH: Number((parsed.bySeverity as Record<string, number> | undefined)?.HIGH || 0),
        MEDIUM: Number((parsed.bySeverity as Record<string, number> | undefined)?.MEDIUM || 0),
        LOW: Number((parsed.bySeverity as Record<string, number> | undefined)?.LOW || 0),
        UNKNOWN: Number((parsed.bySeverity as Record<string, number> | undefined)?.UNKNOWN || 0),
      },
      toolCounts: Object.fromEntries(
        Object.entries((parsed.byTool as Record<string, number> | undefined) || {}).map(
          ([tool, count]) => [tool, Number(count || 0)],
        ),
      ),
      topFiles,
      highPriorityBatch,
      observedFiles: uniqueStrings([
        ...topFiles.map((entry) => entry.filePath),
        ...highPriorityBatch.map((entry) => entry.filePath),
      ]),
    };
  } catch {
    return emptyCodacySummary(sourcePath);
  }
}
