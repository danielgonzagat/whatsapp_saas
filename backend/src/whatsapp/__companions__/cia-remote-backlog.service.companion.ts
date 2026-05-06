import { CiaChatFilterService } from '../cia-chat-filter.service';
import { CiaSendHelpersService } from '../cia-send-helpers.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { WahaChatSummary } from '../providers/whatsapp-api.provider';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from '../whatsapp-normalization.util';
import { WhatsappService } from '../whatsapp.service';

export type BacklogMode = 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot';

const safeStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fb;

export interface RemoteBacklogLoadDeps {
  prisma: PrismaService;
  providerRegistry: WhatsAppProviderRegistry;
  chatFilter: CiaChatFilterService;
  sendHelpers: CiaSendHelpersService;
  whatsappService: WhatsappService;
}

export async function loadRemotePendingBatchHelper(
  deps: RemoteBacklogLoadDeps,
  params: {
    workspaceId: string;
    chat: WahaChatSummary;
    sessionKey: string;
  },
): Promise<{
  contactId?: string;
  phone: string;
  contactName: string;
  aggregatedMessage: string;
  customerMessages: Array<{
    content: string;
    quotedMessageId: string;
    createdAt?: string | null;
  }>;
  historySummary: string;
  shouldMirrorReplies: boolean;
} | null> {
  const rawMessages: unknown = await deps.providerRegistry.getChatMessages(
    params.sessionKey,
    params.chat.id,
    {
      limit: 80,
      offset: 0,
      downloadMedia: false,
    },
  );

  const rawObj = rawMessages as Record<string, unknown> | unknown[] | null;
  const normalizedMessages = (
    Array.isArray(rawObj)
      ? rawObj
      : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.messages)
        ? (rawObj.messages as unknown[])
        : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.items)
          ? (rawObj.items as unknown[])
          : rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.data)
            ? (rawObj.data as unknown[])
            : []
  )
    .map((message: unknown) => {
      const msg = (message && typeof message === 'object' ? message : {}) as Record<
        string,
        unknown
      >;
      const msgId = msg.id as Record<string, unknown> | string | undefined;
      const msgKey = msg.key as Record<string, unknown> | undefined;
      const msgText = msg.text as Record<string, unknown> | undefined;
      const idSerialized = typeof msgId === 'object' && msgId ? msgId._serialized : undefined;
      const idId = typeof msgId === 'object' && msgId ? msgId.id : undefined;
      const keyId = msgKey ? msgKey.id : undefined;
      return {
        externalId: safeStr(idSerialized || idId || keyId || msg.id).trim(),
        fromMe: msg.fromMe === true || (typeof msgId === 'object' && msgId?.fromMe === true),
        content: safeStr(msg.body || msgText?.body).trim(),
        createdAt: deps.sendHelpers.normalizeRemoteTimestamp(
          (msg.timestamp || msg.t || msg.createdAt || null) as string | number | null,
        ),
        raw: msg,
      };
    })
    .filter((message) => message.externalId && message.content);

  if (!normalizedMessages.length) {
    return null;
  }

  let lastOutboundIndex = -1;
  normalizedMessages.forEach((message, index) => {
    if (message.fromMe) {
      lastOutboundIndex = index;
    }
  });

  const pendingMessages = normalizedMessages.filter(
    (message, index) => !message.fromMe && index > lastOutboundIndex,
  );
  const effectivePending = pendingMessages.length
    ? pendingMessages
    : normalizedMessages.filter((message) => !message.fromMe).slice(-1);

  if (!effectivePending.length) {
    return null;
  }

  const latestCustomerActivityTimestamp = Math.max(
    deps.chatFilter.resolveLatestRemoteMessageTimestamp(effectivePending),
    deps.chatFilter.resolveChatActivityTimestamp(params.chat),
  );
  if (!deps.chatFilter.isFreshRemotePendingActivity(latestCustomerActivityTimestamp)) {
    return null;
  }

  const phone = normalizePhoneFromChatId(params.chat.id);
  if (!phone) {
    return null;
  }

  const detectedName =
    deps.sendHelpers.extractRemoteSenderName(
      effectivePending[effectivePending.length - 1]?.raw,
      params.chat.name || null,
    ) || phone;

  const contact = await deps.prisma.contact.upsert({
    where: {
      workspaceId_phone: {
        workspaceId: params.workspaceId,
        phone,
      },
    },
    update: {
      name: detectedName,
    },
    create: {
      workspaceId: params.workspaceId,
      phone,
      name: detectedName,
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });

  await deps.whatsappService
    .syncRemoteContactProfile(params.workspaceId, phone, detectedName)
    .catch(() => undefined);

  const customerMessages = effectivePending.map((message) => ({
    content: message.content,
    quotedMessageId: message.externalId,
    createdAt: message.createdAt,
  }));
  const shouldMirrorReplies = deps.chatFilter.isRecentRemoteBatch(customerMessages);

  return {
    contactId: contact.id,
    phone,
    contactName: contact.name || detectedName,
    aggregatedMessage:
      customerMessages.length === 1
        ? customerMessages[0].content
        : customerMessages
            .map((message, index) => `[${index + 1}] ${String(message.content || '').trim()}`)
            .join('\n'),
    customerMessages,
    historySummary: deps.sendHelpers.buildRemoteHistorySummary(normalizedMessages),
    shouldMirrorReplies,
  };
}
