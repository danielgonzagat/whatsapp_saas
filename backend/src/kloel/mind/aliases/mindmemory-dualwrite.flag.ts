/**
 * Feature flag for the ADDITIVE canonical `RAC_MindMemory` dual-write.
 *
 * Brain → Mind unification (PI-K23 / Claude-K50): the canonical
 * `MindMemory` model (table `RAC_MindMemory`) currently has ZERO writers —
 * it is canonical-but-dead. This flag, when set to `'true'`, makes
 * `MindMemoryItemService.upsert` ALSO write the same record to
 * `prisma.mindMemory` (best-effort, never breaking the legacy
 * `RAC_KloelMemory` write).
 *
 * DEFAULT OFF. No read path consumes this flag. No backfill is performed.
 *
 * @see backend/src/kloel/mind/aliases/mind-memory-item.service.ts
 */
export function isMindMemoryDualWriteEnabled(): boolean {
  return process.env.KLOEL_MINDMEMORY_DUALWRITE === 'true';
}
