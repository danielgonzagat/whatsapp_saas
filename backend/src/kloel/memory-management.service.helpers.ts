/**
 * KLOEL MEMORY MANAGEMENT SERVICE HELPERS — pure formatters and payload builders.
 *
 * Pure module: no I/O, no DI, no side-effects. Sibling of
 * `memory-management.service.ts`. Extracts repetitive log/audit payload code so
 * the service stays focused on orchestration and the helpers can be tested in
 * isolation without hoisting the full NestJS graph.
 */

import type { WorkspaceCleanupOptions } from './memory-management.policies';

/** Counters returned by `MemoryManagementService.cleanupAll`. */
export interface MemoryCleanupResult {
  expiredRemoved: number;
  duplicatesRemoved: number;
  orphansRemoved: number;
  totalBefore: number;
  totalAfter: number;
  duration: number;
}

/**
 * Extracts a stable string message from an `unknown` thrown value. Mirrors the
 * legacy `error instanceof Error ? error.message : 'unknown_error'` snippet
 * sprinkled across the service so logs stay consistent.
 */
export function errorMessage(error: unknown, fallback: string = 'unknown_error'): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Same as `errorMessage` but falls back to `String(error)` for cases where the
 * caller wants to surface non-Error values verbatim (e.g. stale category sweep
 * legacy logging contract).
 */
export function errorMessageOrString(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Formats the summary line emitted at the end of a daily cleanup pass.
 * Pure function — caller owns the logger sink.
 */
export function formatCleanupSummaryMessage(result: MemoryCleanupResult): string {
  return (
    `Cleanup complete: removed ${result.expiredRemoved} expired, ` +
    `${result.duplicatesRemoved} duplicates, ${result.orphansRemoved} orphans`
  );
}

/**
 * Formats the per-workspace cleanup line. Pure function — caller owns the
 * logger sink. Accepts the same options shape consumed by the Prisma filter.
 */
export function formatWorkspaceCleanupMessage(
  workspaceId: string,
  count: number,
  options?: Pick<WorkspaceCleanupOptions, 'category'>,
): string {
  const suffix = options?.category ? ` (category: ${options.category})` : '';
  return `Cleaned ${count} memories from workspace ${workspaceId}${suffix}`;
}

/**
 * Builds the structured `details` payload written to the audit log when a
 * workspace cleanup removes at least one row. Pure function — caller MUST
 * still skip the audit write when `count <= 0`.
 */
export function buildWorkspaceCleanupAuditDetails(
  count: number,
  options?: WorkspaceCleanupOptions,
): { deletedCount: number; category?: string; olderThanDays?: number } {
  return {
    deletedCount: count,
    category: options?.category,
    olderThanDays: options?.olderThanDays,
  };
}

/**
 * Builds the structured `details` payload written to the audit log after a
 * semantic-duplicate merge pass. Pure function — caller MUST skip the audit
 * write when `mergedCount <= 0`.
 */
export function buildSemanticDuplicateAuditDetails(
  category: string,
  mergedCount: number,
): { category: string; mergedCount: number } {
  return { category, mergedCount };
}

/**
 * Formats the log line emitted when a daily cleanup pass fails with an
 * arbitrary error. Pure function — caller owns the logger sink.
 */
export function formatCleanupFailureMessage(error: unknown): string {
  return `Cleanup failed: ${errorMessage(error)}`;
}

/**
 * Formats the log line emitted when the hourly stats job fails. Pure function.
 */
export function formatStatsFailureMessage(error: unknown): string {
  return `Failed to update memory metrics: ${errorMessage(error)}`;
}

/**
 * Formats the log line emitted when expired-memory cleanup fails for a single
 * category. Pure function.
 */
export function formatCategoryCleanupFailureMessage(category: string, error: unknown): string {
  return `Failed to cleanup ${category}: ${errorMessage(error)}`;
}

/**
 * Formats the log line emitted when the uncategorized stale sweep fails. Uses
 * `errorMessageOrString` to preserve the legacy contract that surfaces
 * non-Error throwables verbatim. Pure function.
 */
export function formatStaleUncategorizedFailureMessage(error: unknown): string {
  return `Failed to remove stale uncategorized memories: ${errorMessageOrString(error)}`;
}

/**
 * Formats the log line emitted when the dedup pass fails. Pure function.
 */
export function formatDeduplicationFailureMessage(error: unknown): string {
  return `Deduplication failed: ${errorMessage(error)}`;
}

/**
 * Formats the log line emitted when the orphan sweep fails. Pure function.
 */
export function formatOrphanCleanupFailureMessage(error: unknown): string {
  return `Orphan cleanup failed: ${errorMessage(error)}`;
}

/**
 * Formats the log line emitted when `getStats` fails. Pure function.
 */
export function formatGetStatsFailureMessage(error: unknown): string {
  return `Failed to get stats: ${errorMessage(error)}`;
}

/**
 * Empty fallback returned by `getStats` when computation fails. Returned as a
 * factory so each caller gets a fresh, mutable structure that satisfies the
 * `MemoryStats` interface without sharing state.
 */
export function emptyMemoryStats(): {
  total: number;
  byCategory: Record<string, number>;
  byWorkspace: Record<string, number>;
  oldestEntry: Date | null;
  averageAge: number;
} {
  return {
    total: 0,
    byCategory: {},
    byWorkspace: {},
    oldestEntry: null,
    averageAge: 0,
  };
}
