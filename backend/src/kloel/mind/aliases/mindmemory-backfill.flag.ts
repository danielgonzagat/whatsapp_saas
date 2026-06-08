/**
 * Feature flag for the Brain→Mind MEMORY backfill (cutover Phase 2, twin of the
 * message backfill).
 *
 * The live dual-write (`mind-memory-item.service.ts`, flag
 * KLOEL_MINDMEMORY_DUALWRITE) only mirrors NEW memory upserts into the canonical
 * RAC_MindMemory table. Activating the reader cut-over
 * (KLOEL_MINDMEMORY_READ_CANONICAL) without backfilling the historical
 * RAC_KloelMemory rows would make the canonical store miss all pre-cutover
 * memory. This flag gates that bulk backfill — DEFAULT OFF, fires only on exactly
 * `'true'`. The operator enables it for a supervised run and disables it after.
 *
 * The backfill is idempotent by construction: RAC_MindMemory already has a unique
 * (workspaceId, namespace, key), so each KloelMemory row maps to exactly one
 * MindMemory(namespace='default', key) and `createMany({ skipDuplicates })`
 * makes a re-run — and the overlap with live dual-writes — a no-op. The flag is
 * the intent gate, not the safety mechanism.
 *
 * @see backend/src/kloel/mind/aliases/mind-memory-backfill.service.ts
 * @see backend/src/kloel/mind/aliases/mindmessage-backfill.flag.ts (the twin)
 */
export function isMindMemoryBackfillEnabled(): boolean {
  return (process.env.KLOEL_MINDMEMORY_BACKFILL ?? '').toLowerCase() === 'true';
}
