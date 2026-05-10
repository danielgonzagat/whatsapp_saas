import { autopilotQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { forEachSequential } from '../../utils/async-sequence';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { type UnknownRecord, type WorkspaceSelfIdentity, type RemoteChatSummary, CIA_BACKLOG_CONTINUATION_LIMIT, CIA_REMOTE_PENDING_PROBE_LIMIT, NON_DIGIT_RE } from './shared';
import { resolveCatalogPhoneFromChatId, resolveCanonicalChatId, buildLidMap, extractCatalogChatName, isIndividualWahaChatId, resolveLastMessageFromMe, resolveCatalogChatActivityTimestamp, isWorkspaceSelfTarget } from './identity';

async function scheduleCatalogContactsJob(
  workspaceId: string,
  reason: string,
): Promise<{ scheduled: boolean; reason?: string }> {
  try {
    const { CIA_CONTACT_CATALOG_LOOKBACK_DAYS } = await import('./autopilot-config');
    await autopilotQueue.add(
      'catalog-contacts-30d',
      {
        workspaceId,
        days: CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
        reason,
      },
      {
        jobId: buildQueueJobId('catalog-contacts-30d', workspaceId),
        removeOnComplete: true,
      },
    );
    return { scheduled: true };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    const message = String(errorInstanceofError?.message || '');
    if (message.includes('Job is already waiting')) {
      return { scheduled: false, reason: 'already_waiting' };
    }
    return { scheduled: false, reason: message || 'schedule_failed' };
  }
}

export { scheduleCatalogContactsJob };

export async function getRemoteUnreadChatSnapshot(
  workspaceId: string,
  limit = CIA_BACKLOG_CONTINUATION_LIMIT,
  selfIdentity?: WorkspaceSelfIdentity | null,
): Promise<
  Array<{
    chatId: string;
    canonicalChatId: string;
    phone: string;
    name: string;
    unreadCount: number;
    activityTimestamp: number;
    lastMessageFromMe: boolean | null;
    chat: UnknownRecord;
  }>
> {
  const chats: RemoteChatSummary[] = (await whatsappApiProvider
    .getChats(workspaceId)
    .catch((): RemoteChatSummary[] => [])) as RemoteChatSummary[];
  const lidMap = buildLidMap((await whatsappApiProvider.getLidMappings(workspaceId).catch(() => [])) as Array<{ lid?: string | null; pn?: string | null }>);

  const normalizedChats = (Array.isArray(chats) ? chats : [])
    .map((chat: UnknownRecord) => {
      const chatId = String(chat?.id || '').trim();
      const canonicalChatId = resolveCanonicalChatId(chatId, lidMap);
      const lastMessageFromMe = resolveLastMessageFromMe(chat);
      const unreadCount = Number(chat?.unreadCount || chat?.unread || 0) || 0;
      const activityTimestamp = resolveCatalogChatActivityTimestamp(chat);

      return {
        chatId,
        canonicalChatId,
        phone: resolveCatalogPhoneFromChatId(chatId, lidMap),
        name: extractCatalogChatName(chat, canonicalChatId || chatId),
        unreadCount,
        activityTimestamp,
        lastMessageFromMe,
        chat,
      };
    })
    .filter(
      (item) =>
        item.phone &&
        !isWorkspaceSelfTarget({
          phone: item.phone,
          chatId: item.chatId,
          ...(selfIdentity != null ? { selfIdentity } : {}),
        }) &&
        isIndividualWahaChatId(item.chatId) &&
        item.activityTimestamp > 0,
    );

  const pending = new Map<
    string,
    {
      chatId: string;
      canonicalChatId: string;
      phone: string;
      name: string;
      unreadCount: number;
      activityTimestamp: number;
      lastMessageFromMe: boolean | null;
      chat: UnknownRecord;
    }
  >();

  for (const item of normalizedChats) {
    if (item.unreadCount > 0 || item.lastMessageFromMe === false) {
      pending.set(item.phone, {
        ...item,
        unreadCount:
          item.unreadCount > 0 ? item.unreadCount : item.lastMessageFromMe === false ? 1 : 0,
      });
    }
  }

  if (pending.size === 0) {
    const probeCandidates = normalizedChats
      .filter((item) => item.lastMessageFromMe === null && item.activityTimestamp > 0)
      .sort((left, right) => right.activityTimestamp - left.activityTimestamp)
      .slice(0, CIA_REMOTE_PENDING_PROBE_LIMIT);

    await forEachSequential(probeCandidates, async (candidate) => {
      const probeChatId = candidate.canonicalChatId || candidate.chatId;
      const messages = await whatsappApiProvider
        .getChatMessages(workspaceId, probeChatId, {
          limit: 3,
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);

      const latestMessage = ((Array.isArray(messages) ? messages : ([] as UnknownRecord[])) as UnknownRecord[])
        .map((message: UnknownRecord) => ({
          fromMe: message?.fromMe === true,
          timestamp: Number(message?.timestamp || message?.t || 0) || 0,
        }))
        .sort((left, right) => right.timestamp - left.timestamp)[0];

      if (!latestMessage || latestMessage.fromMe) {
        return;
      }

      pending.set(candidate.phone, {
        ...candidate,
        unreadCount: Math.max(1, candidate.unreadCount || 0),
        lastMessageFromMe: false,
      });
    });
  }

  return Array.from(pending.values())
    .sort((left, right) => {
      if (right.activityTimestamp !== left.activityTimestamp) {
        return right.activityTimestamp - left.activityTimestamp;
      }
      return right.unreadCount - left.unreadCount;
    })
    .slice(0, Math.max(1, limit));
}

export function resolveScanDeliveryMode(data: {
  messageId?: string;
  runId?: string;
  deliveryMode?: 'reactive' | 'proactive';
}): 'reactive' | 'proactive' {
  if (data?.deliveryMode === 'reactive' || data?.deliveryMode === 'proactive') {
    return data.deliveryMode;
  }
  return data?.messageId && !data?.runId ? 'reactive' : 'proactive';
}

export function getSharedReplyLockKey(
  workspaceId: string,
  contactId?: string | null,
  phone?: string | null,
) {
  const normalizedPhone = String(phone || '').replace(NON_DIGIT_RE, '');
  return `autopilot:reply:${workspaceId}:${contactId || normalizedPhone}`;
}
