// PULSE — Codacy snapshot types
// Extracted from types.truth.ts to honour architecture guardrails.

/** Pulse codacy severity type. */
export type PulseCodacySeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** Pulse codacy issue shape. */
export interface PulseCodacyIssue {
  /** Issue id property. */
  issueId: string;
  /** File path property. */
  filePath: string;
  /** Line number property. */
  lineNumber: number;
  /** Pattern id property. */
  patternId: string;
  /** Category property. */
  category: string;
  /** Severity level property. */
  severityLevel: PulseCodacySeverity;
  /** Tool property. */
  tool: string;
  /** Message property. */
  message: string;
  /** Commit sha property. */
  commitSha: string | null;
  /** Commit timestamp property. */
  commitTimestamp: string | null;
}

/** Pulse codacy hotspot shape. */
export interface PulseCodacyHotspot {
  /** File path property. */
  filePath: string;
  /** Issue count property. */
  issueCount: number;
  /** Highest severity property. */
  highestSeverity: PulseCodacySeverity;
  /** Categories property. */
  categories: string[];
  /** Tools property. */
  tools: string[];
  /** High severity count property. */
  highSeverityCount: number;
}

/** Pulse codacy summary shape. */
export interface PulseCodacySummary {
  /** Snapshot available property. */
  snapshotAvailable: boolean;
  /** Source path property. */
  sourcePath: string | null;
  /** Synced at property. */
  syncedAt: string | null;
  /** Age minutes property. */
  ageMinutes: number | null;
  /** Stale property. */
  stale: boolean;
  /** Repository loc property. */
  loc: number;
  /** Total issues property. */
  totalIssues: number;
  /** Severity counts property. */
  severityCounts: Record<PulseCodacySeverity, number>;
  /** Tool counts property. */
  toolCounts: Record<string, number>;
  /** Top files property. */
  topFiles: PulseCodacyHotspot[];
  /** High priority batch property. */
  highPriorityBatch: PulseCodacyIssue[];
  /** Observed files property. */
  observedFiles: string[];
}
