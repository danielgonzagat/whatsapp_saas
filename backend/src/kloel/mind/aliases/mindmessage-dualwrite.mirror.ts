import { isMindMessageDualWriteEnabled } from './mindmessage-dualwrite.flag';

/**
 * Canonical `RAC_MindMessage` dual-write record. The four legacy message
 * surfaces (channel/inbox, thread, dashboard, lead conversation) all mirror
 * into the SAME canonical shape — only the `source` discriminator differs.
 */
export interface MindMessageMirrorInput {
  workspaceId: string;
  /** Unified-table discriminator: which legacy surface the row came from. */
  source: 'brain' | 'channel' | 'thread' | 'dashboard' | 'lead_conversation';
  role: string;
  content: string;
}

/**
 * Minimal structural view of the prisma client this helper needs — just the
 * `mindMessage.create` delegate. Typing to the structural minimum (rather than
 * the full `PrismaService`) keeps the helper trivially callable from the partial
 * prisma mocks the existing dual-write specs already use.
 */
export interface MindMessagePrismaLike {
  mindMessage: {
    create(args: { data: MindMessageMirrorInput }): Promise<unknown>;
  };
}

/**
 * Single canonical implementation of the ADDITIVE, flag-gated, best-effort
 * dual-write of a legacy message into the canonical `RAC_MindMessage` table.
 *
 * This extracts the byte-equivalent core that was hand-rolled four times
 * (inbox `dualWriteChannelMindMessage`, kloel-thread `dualWriteThreadMindMessage`,
 * chat `ChatService.addMessage`, and `dualWriteLeadConversationMindMessage`):
 *
 *   1. no-op when `KLOEL_MINDMESSAGE_DUALWRITE` is OFF (default);
 *   2. otherwise `prisma.mindMessage.create({ data: { workspaceId, source, role, content } })`;
 *   3. fail-open — any error is handed to `onError` and NEVER re-thrown, so the
 *      legacy write the caller already committed can never be affected.
 *
 * Per-surface concerns that are NOT identical across the four callers stay at
 * the call site, on purpose:
 *   - the field-gap pre-guard (each surface skips on a different empty-field set);
 *   - the warn-log message (each surface logs distinct context — direction /
 *     role / conversationId / PT-BR), via the `onError` callback.
 *
 * The default behavior is byte-identical to all four originals.
 *
 * @see backend/src/kloel/mind/aliases/mindmessage-dualwrite.flag.ts
 */
export async function mirrorMindMessage(
  prisma: MindMessagePrismaLike,
  input: MindMessageMirrorInput,
  onError: (error: unknown) => void,
): Promise<void> {
  if (!isMindMessageDualWriteEnabled()) {
    return;
  }
  try {
    await prisma.mindMessage.create({
      data: {
        workspaceId: input.workspaceId,
        source: input.source,
        role: input.role,
        content: input.content,
      },
    });
  } catch (error) {
    onError(error);
  }
}
