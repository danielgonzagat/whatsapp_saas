/**
 * Feature flag for the ADDITIVE canonical `RAC_MindMessage` dual-write.
 *
 * Brain → Mind unification (PI-K23 / Claude-K50): the canonical
 * `MindMessage` model (table `RAC_MindMessage`) currently has ZERO writers —
 * it is canonical-but-dead. This flag, when set to `'true'`, makes the
 * primary dashboard chat-message persist (`ChatService.addMessage`) ALSO write
 * the same record to `prisma.mindMessage` (best-effort, never breaking the
 * legacy `RAC_ChatMessage` write).
 *
 * DEFAULT OFF. No read path consumes this flag. No backfill is performed.
 *
 * @see backend/src/chat/chat.service.ts
 */
export function isMindMessageDualWriteEnabled(): boolean {
  return process.env.KLOEL_MINDMESSAGE_DUALWRITE === 'true';
}
