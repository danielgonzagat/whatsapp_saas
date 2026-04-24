import { Injectable } from '@nestjs/common';
import { WahaChatSummary } from './providers/whatsapp-api.provider';

const CIA_REMOTE_PENDING_MAX_AGE_MS = Math.max(
  60_000,
  Number.parseInt(
    process.env.CIA_REMOTE_PENDING_MAX_AGE_MS ||
      process.env.CIA_BOOTSTRAP_REMOTE_LOOKBACK_MS ||
      `${30 * 24 * 60 * 60 * 1000}`,
    10,
  ) || 30 * 24 * 60 * 60 * 1000,
);

const CIA_REMOTE_UNKNOWN_PENDING_MAX_AGE_MS = Math.max(
  CIA_REMOTE_PENDING_MAX_AGE_MS,
  Number.parseInt(
    process.env.CIA_REMOTE_UNKNOWN_PENDING_MAX_AGE_MS || `${30 * 24 * 60 * 60 * 1000}`,
    10,
  ) || 30 * 24 * 60 * 60 * 1000,
);

const CIA_INLINE_BACKLOG_FALLBACK_LIMIT = Math.max(
  1,
  Math.min(50, Number.parseInt(process.env.CIA_INLINE_BACKLOG_FALLBACK_LIMIT || '10', 10) || 10),
);

/**
 * Pure helper service for filtering and normalising remote WhatsApp chat summaries.
 * No DB access, no Redis — only stateless logic extracted from CiaRuntimeService.
 */
@Injectable()
export class CiaChatFilterService {
  /** Resolve the best activity timestamp from a list of raw timestamp candidates. */
  resolveChatTimestamp(candidates: unknown[]): number {
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate > 1e12 ? candidate : candidate * 1000;
      }

      if (typeof candidate === 'string') {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric > 1e12 ? numeric : numeric * 1000;
        }

        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }

    return 0;
  }

  /** Normalise a raw provider chat list into typed WahaChatSummary[]. */
  normalizeChats(raw: unknown): WahaChatSummary[] {
    const rawObj = raw as Record<string, unknown> | unknown[] | null;
    const candidates: unknown[] = Array.isArray(rawObj)
      ? rawObj
      : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.chats)
        ? (rawObj.chats as unknown[])
        : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.items)
          ? (rawObj.items as unknown[])
          : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.data)
            ? (rawObj.data as unknown[])
            : [];

    return candidates
      .map((chatRaw: unknown) => {
        const chat = (chatRaw && typeof chatRaw === 'object' ? chatRaw : {}) as Record<
          string,
          unknown
        >;
        const chatIdObj = chat.id as Record<string, unknown> | string | undefined;
        const lastMessage = chat.lastMessage as Record<string, unknown> | null | undefined;
        const lastMsgData = lastMessage?._data as Record<string, unknown> | undefined;
        const lastMsgId = lastMessage?.id as Record<string, unknown> | undefined;
        const chatChat = chat._chat as Record<string, unknown> | undefined;

        const activityTimestamp = this.resolveChatTimestamp([
          lastMessage?.timestamp,
          lastMsgData?.messageTimestamp,
          chatChat?.conversationTimestamp,
          chatChat?.lastMessageRecvTimestamp,
          chat.conversationTimestamp,
          chat.lastMessageRecvTimestamp,
          chat.lastMessageSentTimestamp,
          chat.lastMessageTimestamp,
          chat.timestamp,
          chat.t,
          chat.createdAt,
          chat.last_time,
        ]);

        const lastMessageTimestamp = this.resolveChatTimestamp([
          lastMessage?.timestamp,
          lastMsgData?.messageTimestamp,
          chatChat?.conversationTimestamp,
          chatChat?.lastMessageRecvTimestamp,
          chat.lastMessageRecvTimestamp,
          chat.lastMessageSentTimestamp,
          chat.lastMessageTimestamp,
          chat.conversationTimestamp,
          chat.timestamp,
          chat.t,
          chat.createdAt,
          chat.last_time,
        ]);

        const lastMsgDataId = lastMsgData?.id as Record<string, unknown> | undefined;

        return {
          id:
            (typeof chatIdObj === 'object' && chatIdObj ? chatIdObj._serialized : undefined) ||
            chat.id ||
            chat.chatId ||
            chat.wid ||
            '',
          unreadCount: Number(chat.unreadCount || chat.unread || 0) || 0,
          timestamp: activityTimestamp,
          lastMessageTimestamp,
          lastMessageRecvTimestamp: this.resolveChatTimestamp([
            chat.lastMessageRecvTimestamp,
            chatChat?.lastMessageRecvTimestamp,
            chat.conversationTimestamp,
          ]),
          lastMessageFromMe:
            typeof lastMessage?.fromMe === 'boolean'
              ? lastMessage.fromMe
              : typeof lastMsgDataId?.fromMe === 'boolean'
                ? lastMsgDataId.fromMe
                : typeof lastMsgId?.fromMe === 'boolean'
                  ? lastMsgId.fromMe
                  : null,
        } as WahaChatSummary;
      })
      .filter((chat) => !!chat.id);
  }

  hasUnknownPendingSignal(chat: WahaChatSummary): boolean {
    const lastFromMeIsUnknown =
      chat.lastMessageFromMe === null || chat.lastMessageFromMe === undefined;
    const recvTimestamp = Number(chat.lastMessageRecvTimestamp || 0);
    return lastFromMeIsUnknown && recvTimestamp > 0;
  }

  resolveChatActivityTimestamp(chat: WahaChatSummary): number {
    return Math.max(Number(chat.timestamp || 0) || 0, Number(chat.lastMessageTimestamp || 0) || 0);
  }

  resolveLatestRemoteMessageTimestamp(messages: Array<{ createdAt?: string | null }>): number {
    return messages
      .map((message) => {
        const timestamp = message?.createdAt ? new Date(message.createdAt).getTime() : Number.NaN;
        return Number.isFinite(timestamp) ? timestamp : 0;
      })
      .sort((left, right) => right - left)[0];
  }

  isFreshRemotePendingActivity(timestamp: number): boolean {
    return timestamp > 0 && Date.now() - timestamp <= CIA_REMOTE_PENDING_MAX_AGE_MS;
  }

  isFreshUnknownRemotePendingActivity(timestamp: number): boolean {
    return timestamp > 0 && Date.now() - timestamp <= CIA_REMOTE_UNKNOWN_PENDING_MAX_AGE_MS;
  }

  isRemotePendingChat(chat: WahaChatSummary, includeZeroUnreadActivity: boolean): boolean {
    if ((chat.unreadCount || 0) > 0) {
      return true;
    }

    const activityTimestamp = this.resolveChatActivityTimestamp(chat);

    if (
      this.hasUnknownPendingSignal(chat) &&
      this.isFreshUnknownRemotePendingActivity(activityTimestamp)
    ) {
      return true;
    }

    if (!this.isFreshRemotePendingActivity(activityTimestamp)) {
      return false;
    }

    return chat.lastMessageFromMe === false || includeZeroUnreadActivity;
  }

  compareRemotePendingChats(left: WahaChatSummary, right: WahaChatSummary): number {
    const activityDiff =
      this.resolveChatActivityTimestamp(right) - this.resolveChatActivityTimestamp(left);
    if (activityDiff !== 0) {
      return activityDiff;
    }

    const unreadDiff = (Number(right.unreadCount || 0) || 0) - (Number(left.unreadCount || 0) || 0);
    if (unreadDiff !== 0) {
      return unreadDiff;
    }

    return String(left.id || '').localeCompare(String(right.id || ''));
  }

  selectRemotePendingChats(chats: WahaChatSummary[]): WahaChatSummary[] {
    const includeZeroUnreadActivity =
      String(process.env.CIA_BOOTSTRAP_INCLUDE_ZERO_UNREAD_ACTIVITY || 'false').toLowerCase() ===
      'true';

    return [...chats]
      .filter((chat) => this.isRemotePendingChat(chat, includeZeroUnreadActivity))
      .sort((left, right) => this.compareRemotePendingChats(left, right));
  }

  estimatePendingMessages(chat: WahaChatSummary): number {
    return Math.max(
      1,
      Number(chat.unreadCount || 0) || 0,
      chat.lastMessageFromMe === false ? 1 : 0,
    );
  }

  resolveInlineBacklogFallbackLimit(limit: number): number {
    return Math.max(
      1,
      Math.min(
        CIA_INLINE_BACKLOG_FALLBACK_LIMIT,
        Math.max(1, Math.min(2000, Number(limit || 1) || 1)),
      ),
    );
  }

  isRecentRemoteBatch(messages: Array<{ createdAt?: string | null }>): boolean {
    const latest = this.resolveLatestRemoteMessageTimestamp(messages);
    return latest > 0 && Date.now() - latest <= 24 * 60 * 60 * 1000;
  }
}
