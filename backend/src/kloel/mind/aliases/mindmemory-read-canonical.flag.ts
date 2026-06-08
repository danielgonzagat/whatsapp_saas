/**
 * Feature flag for the canonical `RAC_MindMemory` READER cut-over.
 *
 * Brain → Mind unification (message-memory-cutover, MIGRATION_PLAYBOOK.md):
 * the canonical `MindMemory` model (table `RAC_MindMemory`) is fed on the
 * `namespace='default'` plane by the additive, best-effort dual-write gated by
 * `KLOEL_MINDMEMORY_DUALWRITE`, but that plane has ZERO readers — it is
 * canonical-but-DEAD-on-read while `RAC_KloelMemory` stays authoritative.
 *
 * When this flag is set to `'true'`, the canonical read facade
 * (`MindMemoryItemService.findByKey` / `listByWorkspace`, reached via
 * `MindCanonicalService.getMemoryItem`) reads from `prisma.mindMemory` SCOPED
 * TO `namespace='default'` instead of the legacy `prisma.kloelMemory`. It is
 * the SEPARATE read flag the playbook requires so reads can revert instantly
 * while the legacy store keeps being written:
 *   - the read is scoped to `namespace='default'` ONLY — the live per-user
 *     `umem:<userId>` plane owned by `KloelMemoryEngineService` is NEVER
 *     touched;
 *   - on a MISSING/EMPTY canonical result OR any error, the reader FALLS BACK
 *     to the legacy `RAC_KloelMemory` row (so a not-yet-backfilled key never
 *     surfaces as absent);
 *   - flag OFF (default) is BYTE-IDENTICAL to today — the legacy read only.
 *
 * Kept deliberately separate from `KLOEL_MINDMEMORY_DUALWRITE` (the write flag)
 * so the reader can flip back without touching dual-write soak.
 *
 * DEFAULT OFF. No backfill is performed by this flag.
 *
 * @see backend/src/kloel/mind/aliases/mind-memory-item.service.ts
 * @see docs/architecture/MIGRATION_PLAYBOOK.md (message-memory-cutover)
 */
export function isMindMemoryReadCanonicalEnabled(): boolean {
  return process.env.KLOEL_MINDMEMORY_READ_CANONICAL === 'true';
}
