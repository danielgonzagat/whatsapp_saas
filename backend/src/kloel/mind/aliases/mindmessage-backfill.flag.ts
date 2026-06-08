/**
 * Feature flag for the Brain→Mind message BACKFILL (cutover Phase 2).
 *
 * Unlike the live percept/dual-write flags (which are additive per-event and now
 * default ON), the backfill is a deliberate BULK operation that copies the
 * historical RAC_KloelMessage rows into the canonical RAC_MindMessage table. It
 * must NEVER run by accident, so it is DEFAULT OFF and only fires when
 * `KLOEL_MINDMESSAGE_BACKFILL` is exactly `'true'`. The operator enables it for
 * the duration of a supervised backfill run and disables it afterwards.
 *
 * The backfill itself is idempotent (unique (workspaceId, source, sourceId) on
 * RAC_MindMessage + `skipDuplicates`), so re-running is safe; the flag is the
 * intent gate, not the safety mechanism.
 *
 * @see backend/src/kloel/mind/aliases/mind-message-backfill.service.ts
 */
export function isMindMessageBackfillEnabled(): boolean {
  return (process.env.KLOEL_MINDMESSAGE_BACKFILL ?? '').toLowerCase() === 'true';
}
