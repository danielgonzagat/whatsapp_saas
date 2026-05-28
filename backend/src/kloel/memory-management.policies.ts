/**
 * KLOEL MEMORY POLICIES — declarative TTL configuration for memory categories.
 *
 * Pure data module: no I/O, no DI, no side-effects. Extracted from
 * memory-management.service.ts to keep the service slim and let other modules
 * (tests, docs, future tools) reuse the canonical policy table without
 * pulling the full service graph.
 */

/**
 * Default TTL (in days) per memory category.
 * The `default` key applies to any category not explicitly listed.
 */
export const MEMORY_EXPIRATION_DAYS: Readonly<Record<string, number>> = Object.freeze({
  products: 365, // Produtos duram 1 ano
  objection: 365, // Respostas de objeção duram 1 ano
  script: 365, // Scripts duram 1 ano
  leads: 90, // Dados de leads expiram em 90 dias
  followups: 30, // Follow-ups antigos expiram em 30 dias
  appointments: 90, // Agendamentos antigos expiram em 90 dias
  conversation_context: 7, // Contexto de conversa expira em 7 dias
  temporary: 1, // Dados temporários expiram em 1 dia
  default: 180, // Padrão: 6 meses
});

/**
 * Returns the list of known categories (everything except the `default` slot).
 */
export function knownMemoryCategories(
  policy: Readonly<Record<string, number>> = MEMORY_EXPIRATION_DAYS,
): string[] {
  return Object.keys(policy).filter((c) => c !== 'default');
}

/**
 * Computes the cutoff Date for a given category, falling back to `default`.
 * Pure function — accepts `now` for deterministic testing.
 */
export function cutoffDateForCategory(
  category: string,
  policy: Readonly<Record<string, number>> = MEMORY_EXPIRATION_DAYS,
  now: Date = new Date(),
): Date {
  const days = policy[category] ?? policy.default ?? 180;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

/**
 * Identifies duplicate memory IDs within a list of (id, key) pairs.
 * Keeps the first occurrence of each `key`, marks the rest for deletion.
 * Pure function — caller owns the DB I/O.
 */
export function findDuplicateMemoryIds<T extends { id: string; key: string }>(
  memories: ReadonlyArray<T>,
): string[] {
  const seenKeys = new Set<string>();
  const toDelete: string[] = [];

  for (const mem of memories) {
    if (seenKeys.has(mem.key)) {
      toDelete.push(mem.id);
    } else {
      seenKeys.add(mem.key);
    }
  }

  return toDelete;
}

/**
 * Groups memories by the first two underscore-delimited prefix tokens of
 * their `key` field (e.g. `product_offer_x` → `product_offer`).
 * Pure function — caller owns the DB I/O.
 */
export function groupMemoriesByKeyPrefix<T extends { key: string }>(
  memories: ReadonlyArray<T>,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const mem of memories) {
    const prefix = mem.key.split('_').slice(0, 2).join('_');
    const group = groups.get(prefix);
    if (group) {
      group.push(mem);
    } else {
      groups.set(prefix, [mem]);
    }
  }
  return groups;
}

/**
 * Sorts memories by `updatedAt` descending and returns the IDs of all but the
 * first (most recent) — i.e. the entries safe to delete during semantic merge.
 * Pure function — caller owns the DB I/O.
 */
export function pickStaleSemanticDuplicateIds<
  T extends { id: string; updatedAt: Date | string },
>(memories: ReadonlyArray<T>): string[] {
  if (memories.length <= 1) {
    return [];
  }
  const sorted = [...memories].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return sorted.slice(1).map((m) => m.id);
}

/**
 * Diffs the workspaceIds present in memories vs the workspaceIds known to be
 * alive, returning the orphan IDs. Pure set operation.
 */
export function findOrphanWorkspaceIds(
  memoryWorkspaceIds: ReadonlyArray<string>,
  aliveWorkspaceIds: ReadonlyArray<string>,
): string[] {
  const alive = new Set(aliveWorkspaceIds);
  return memoryWorkspaceIds.filter((id) => !alive.has(id));
}
