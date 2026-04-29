// PULSE — Live Codebase Nervous System
// GitNexus Freshness Engine types (Wave 9)

/**
 * Snapshot of GitNexus index freshness against the current git HEAD.
 *
 * Determines whether the knowledge graph accurately reflects the
 * current branch state and whether reindexing is recommended.
 */
export interface GitNexusFreshness {
  /** The commit hash that was last indexed by GitNexus, or null if never indexed. */
  lastIndexedCommit: string | null;
  /** The current HEAD commit hash. */
  currentCommit: string;
  /** Whether the index is stale relative to HEAD. */
  stale: boolean;
  /** Number of commits the index is behind the current HEAD. */
  filesBehind: number;
  /** ISO-8601 timestamp of when freshness was last checked. */
  lastChecked: string;
  /** Whether a reindex is recommended based on staleness heuristics. */
  reindexRecommended: boolean;
  /** Whether impact analysis is available (index fresh enough). */
  impactAnalysisAvailable: boolean;
  /** Number of files currently tracked in the GitNexus index. */
  indexedFiles: number;
  /** Estimated total number of indexable files in the repository. */
  totalIndexableFiles: number;
  /** Percentage of indexable files currently indexed (0–100). */
  coveragePercent: number;
  /** Whether the GitNexus index directory (.gitnexus) exists on disk. */
  hasIndexDirectory: boolean;
  /** When true, the index is fresh enough to gate PULSE autonomous decisions. */
  autonomyGatePassed: boolean;
}
