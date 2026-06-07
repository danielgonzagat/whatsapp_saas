/**
 * Feature flag for the canonical `RAC_MindMessage` READER cut-over.
 *
 * Brain → Mind unification (message-memory-cutover, MIGRATION_PLAYBOOK.md):
 * the canonical `MindMessage` model (table `RAC_MindMessage`) is fed by the
 * additive, best-effort dual-write gated by `KLOEL_MINDMESSAGE_DUALWRITE`, but
 * has ZERO readers — it is canonical-but-DEAD-on-read while `RAC_KloelMessage`
 * stays authoritative.
 *
 * When this flag is set to `'true'`, the canonical read facade
 * (`MindMessageService.getHistory`, reached via
 * `MindCanonicalService.getConversationHistory`) reads from
 * `prisma.mindMessage` instead of the legacy `prisma.kloelMessage`. It is the
 * SEPARATE read flag the playbook requires so reads can revert instantly while
 * the legacy store keeps being written:
 *   - on an EMPTY canonical result OR any error, the reader FALLS BACK to the
 *     legacy `RAC_KloelMessage` window (so a not-yet-backfilled workspace never
 *     surfaces an empty history);
 *   - flag OFF (default) is BYTE-IDENTICAL to today — the legacy read only.
 *
 * Kept deliberately separate from `KLOEL_MINDMESSAGE_DUALWRITE` (the write
 * flag) so the reader can flip back without touching dual-write soak.
 *
 * DEFAULT OFF. No backfill is performed by this flag.
 *
 * @see backend/src/kloel/mind/aliases/mind-message.service.ts
 * @see docs/architecture/MIGRATION_PLAYBOOK.md (message-memory-cutover)
 */
export function isMindMessageReadCanonicalEnabled(): boolean {
  return process.env.KLOEL_MINDMESSAGE_READ_CANONICAL === 'true';
}
