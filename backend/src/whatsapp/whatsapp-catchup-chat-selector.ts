import type { ICatchupHistory, CatchupBackfillCursor } from './whatsapp.interfaces';
import type { WahaChatSummary } from './providers/whatsapp-api.provider';

export function sortChatsByPriority(
  chats: WahaChatSummary[],
  since: Date,
  history: ICatchupHistory,
  resolveChatActivityTimestamp: (chat: WahaChatSummary) => number,
): WahaChatSummary[] {
  return [...chats].sort((a, b) => {
    const ud = (b.unreadCount || 0) - (a.unreadCount || 0);
    if (ud !== 0) {
      return ud;
    }
    const ad = resolveChatActivityTimestamp(b) - resolveChatActivityTimestamp(a);
    if (ad !== 0) {
      return ad;
    }
    const rpd =
      Number(history.isRemoteChatAwaitingReply(b)) - Number(history.isRemoteChatAwaitingReply(a));
    if (rpd !== 0) {
      return rpd;
    }
    const rd =
      Number(resolveChatActivityTimestamp(b) >= since.getTime()) -
      Number(resolveChatActivityTimestamp(a) >= since.getTime());
    if (rd !== 0) {
      return rd;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

export function selectCandidateChats(
  chats: WahaChatSummary[],
  since: Date,
  history: ICatchupHistory,
  includeZeroUnreadActivity: boolean,
  fallbackChatsPerPass: number,
  resolveChatActivityTimestamp: (chat: WahaChatSummary) => number,
  cursor?: CatchupBackfillCursor,
): { chats: WahaChatSummary[]; fallbackChatIds: Set<string> } {
  const pri = sortChatsByPriority(
    chats.filter(
      (c) =>
        (c.unreadCount || 0) > 0 ||
        history.isRemoteChatAwaitingReply(c) ||
        (includeZeroUnreadActivity && resolveChatActivityTimestamp(c) >= since.getTime()),
    ),
    since,
    history,
    resolveChatActivityTimestamp,
  );
  const stale = sortChatsByPriority(
    chats.filter(
      (c) =>
        (c.unreadCount || 0) <= 0 &&
        !history.isRemoteChatAwaitingReply(c) &&
        resolveChatActivityTimestamp(c) < since.getTime(),
    ),
    since,
    history,
    resolveChatActivityTimestamp,
  );
  const fb = (history.rotateFallbackChatsByCursor(stale, cursor) as WahaChatSummary[]).slice(
    0,
    fallbackChatsPerPass,
  );
  const deduped = new Map<string, WahaChatSummary>();
  for (const c of [...pri, ...fb]) {
    if (!deduped.has(c.id)) {
      deduped.set(c.id, c);
    }
  }
  return { chats: Array.from(deduped.values()), fallbackChatIds: new Set(fb.map((c) => c.id)) };
}
