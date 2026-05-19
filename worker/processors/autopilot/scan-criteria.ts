import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import {
  normalizeJsonObject,
  PENDING_MESSAGE_LIMIT,
  type UnknownRecord,
  type QuotedCustomerMessage,
  type WorkspaceSelfIdentity,
} from './shared';
import {
  isWorkspaceSelfTarget,
  resolveTrustedCatalogName,
  extractTrustedNameFromRemoteMessage,
} from './identity';
import { findFirstSequential } from '../../utils/async-sequence';

const scanLog = new WorkerLogger('autopilot:scan-criteria');

export async function buildPendingMessageBatch(params: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  chatId?: string;
  fallbackMessageContent?: string;
  selfIdentity?: WorkspaceSelfIdentity | null;
}) {
  const { workspaceId, contactId, phone, chatId, fallbackMessageContent, selfIdentity } = params;

  let contact = contactId
    ? await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { id: true, phone: true, leadScore: true, name: true, customFields: true },
      })
    : null;

  if (!contact && phone) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: { id: true, phone: true, leadScore: true, name: true, customFields: true },
    });
  }

  const resolvedContactId = contact?.id || contactId;
  const resolvedPhone = contact?.phone || phone;

  if (!resolvedContactId || !resolvedPhone) {
    return null;
  }

  if (isWorkspaceSelfTarget({ phone: resolvedPhone, chatId, selfIdentity })) {
    return null;
  }

  const lastOutbound = await prisma.message.findFirst({
    where: { workspaceId, contactId: resolvedContactId, direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const inboundMessages = await prisma.message.findMany({
    where: {
      workspaceId,
      contactId: resolvedContactId,
      direction: 'INBOUND',
      ...(lastOutbound?.createdAt ? { createdAt: { gt: lastOutbound.createdAt } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: PENDING_MESSAGE_LIMIT,
    select: { id: true, externalId: true, content: true, createdAt: true },
  });

  const usableMessages = inboundMessages.filter(
    (message) => String(message.content || '').trim().length > 0,
  );
  let effectiveMessages = usableMessages.length
    ? usableMessages
    : fallbackMessageContent
      ? [
          {
            id: undefined as string | undefined,
            externalId: undefined as string | undefined,
            content: fallbackMessageContent,
            createdAt: new Date(),
          },
        ]
      : [];

  const storedCustomFields = normalizeJsonObject(contact?.customFields);
  let resolvedContactName = resolveTrustedCatalogName(
    resolvedPhone,
    contact?.name,
    storedCustomFields.remotePushName,
  );
  const remoteChatCandidates = Array.from(
    new Set(
      [
        String(chatId || '').trim(),
        String(storedCustomFields.lastRemoteChatId || '').trim(),
        String(storedCustomFields.lastCatalogChatId || '').trim(),
        String(storedCustomFields.lastResolvedChatId || '').trim(),
        `${resolvedPhone}@c.us`,
      ].filter(Boolean),
    ),
  );
  let resolvedRemoteChatId =
    remoteChatCandidates.find((candidate) => candidate.includes('@')) || `${resolvedPhone}@c.us`;

  if (!effectiveMessages.length && resolvedPhone) {
    await findFirstSequential(remoteChatCandidates, async (remoteChatId) => {
      const remoteMessages = await whatsappApiProvider
        .getChatMessages(workspaceId, remoteChatId, {
          limit: Math.max(PENDING_MESSAGE_LIMIT * 4, 20),
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);
      if (!Array.isArray(remoteMessages) || remoteMessages.length === 0) {
        return undefined;
      }

      const normalizedRemoteMessages = (remoteMessages as UnknownRecord[])
        .map((message) => ({
          id: undefined as string | undefined,
          externalId:
            String(
              message?.externalId ||
                message?.id ||
                message?.key?.id ||
                message?.key?._serialized ||
                '',
            ).trim() || undefined,
          direction:
            String(message?.direction || '')
              .trim()
              .toUpperCase() ||
            (message?.fromMe === true ||
            message?.key?.fromMe === true ||
            message?.id?.fromMe === true
              ? 'OUTBOUND'
              : 'INBOUND'),
          content: String(
            message?.content || message?.body || message?.text?.body || message?.caption || '',
          ).trim(),
          createdAt:
            message?.createdAt || message?.timestamp || message?.messageTimestamp || new Date(),
        }))
        .filter((message) => message.content)
        .sort(
          (left, right) =>
            new Date(left.createdAt as string | number | Date).getTime() -
            new Date(right.createdAt as string | number | Date).getTime(),
        );

      for (const remoteMessage of (Array.isArray(remoteMessages)
        ? remoteMessages
        : []) as UnknownRecord[]) {
        const remoteTrustedName = extractTrustedNameFromRemoteMessage(remoteMessage, resolvedPhone);
        if (remoteTrustedName) {
          resolvedContactName = remoteTrustedName;
          break;
        }
      }

      const latestRemoteMessage =
        normalizedRemoteMessages[normalizedRemoteMessages.length - 1] || null;
      if (latestRemoteMessage?.direction === 'OUTBOUND') {
        return undefined;
      }

      const remoteInboundAfterLastOutbound = normalizedRemoteMessages.filter(
        (message) =>
          message.direction === 'INBOUND' &&
          (!lastOutbound?.createdAt ||
            new Date(message.createdAt as string | number | Date).getTime() >
              lastOutbound.createdAt.getTime()),
      );

      const trailingInbound: typeof normalizedRemoteMessages = [];
      for (let index = normalizedRemoteMessages.length - 1; index >= 0; index -= 1) {
        const message = normalizedRemoteMessages[index];
        if (message.direction === 'OUTBOUND') {
          break;
        }
        if (message.direction === 'INBOUND') {
          trailingInbound.unshift(message);
        }
        if (trailingInbound.length >= PENDING_MESSAGE_LIMIT) {
          break;
        }
      }

      const remotePendingMessages = (
        remoteInboundAfterLastOutbound.length ? remoteInboundAfterLastOutbound : trailingInbound
      ).slice(-PENDING_MESSAGE_LIMIT);

      if (remotePendingMessages.length > 0) {
        effectiveMessages = remotePendingMessages;
        resolvedRemoteChatId = remoteChatId;
        return true;
      }
      return undefined;
    });
  }

  if (!effectiveMessages.length) {
    return null;
  }

  const aggregatedMessage =
    effectiveMessages.length === 1
      ? String(effectiveMessages[0].content)
      : effectiveMessages
          .map((message, index: number) => `[${index + 1}] ${String(message.content || '').trim()}`)
          .join('\n');

  return {
    contactId: resolvedContactId,
    phone: resolvedPhone,
    chatId: resolvedRemoteChatId,
    contactName: resolvedContactName || resolvedPhone,
    leadScore: contact?.leadScore,
    messageContent: aggregatedMessage,
    messageCount: effectiveMessages.length,
    messageIds: effectiveMessages.map((message) => message.id).filter(Boolean),
    providerMessageIds: effectiveMessages.map((message) => message.externalId).filter(Boolean),
    customerMessages: effectiveMessages
      .map((message) => ({
        content: String(message.content || '').trim(),
        quotedMessageId: String(message.externalId || '').trim() || undefined,
        createdAt: message.createdAt?.toISOString?.() || undefined,
      }))
      .filter((message: QuotedCustomerMessage) => message.content.length > 0),
  };
}

export { scanLog };
