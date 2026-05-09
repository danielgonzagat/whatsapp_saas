import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { autopilotQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { forEachSequential } from '../../utils/async-sequence';
import { publishAgentEvent } from '../../providers/agent-events';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { log, normalizeJsonObject, type UnknownRecord, type RemoteChatSummary, CIA_BACKLOG_CONTINUATION_LIMIT, CIA_CONTACT_CATALOG_LOOKBACK_DAYS, CIA_CONTACT_CATALOG_MAX_CHATS, NON_DIGIT_RE, D__D_S____S_DOE_RE } from './shared';
import { resolveWorkspaceSelfIdentity, isWorkspaceSelfTarget, resolveCanonicalChatId, resolveCatalogPhoneFromChatId, resolveLastMessageFromMe, buildLidMap, isIndividualWahaChatId, resolveCatalogChatActivityTimestamp, extractCatalogChatName } from './identity';
import { getRemoteUnreadChatSnapshot, seedRemoteUnreadConversationShells, scheduleBacklogContinuation, setWorkspaceSilentLiveMode } from './backlog';
import { upsertCatalogConversationShell } from './opportunity';

const catalogLog = new WorkerLogger('autopilot:catalog');

export async function runCatalogContacts(data: UnknownRecord) {
  const workspaceId = String(data?.workspaceId || '').trim();
  if (!workspaceId) {
    return { cataloged: 0, scoredQueued: 0, reason: 'workspace_missing' };
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings as UnknownRecord) || {};
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);
  const remotePendingBeforeCatalog = await getRemoteUnreadChatSnapshot(
    workspaceId,
    CIA_BACKLOG_CONTINUATION_LIMIT,
    selfIdentity,
  ).catch(() => []);

  if (remotePendingBeforeCatalog.length > 0) {
    await seedRemoteUnreadConversationShells({
      workspaceId,
      selfIdentity,
      chats: remotePendingBeforeCatalog,
    }).catch((err) => {
      log.warn('seed_remote_unread_catalog_failed', { error: err?.message });
      return 0;
    });
    await scheduleBacklogContinuation({
      workspaceId,
      reason: 'catalog_blocked_by_remote_backlog',
      limit: Math.max(10, remotePendingBeforeCatalog.length),
      mode: 'reply_all_recent_first',
    }).catch((err) => {
      log.warn('schedule_backlog_continuation_failed', { error: err?.message });
      return undefined;
    });
    await publishAgentEvent({
      type: 'status',
      workspaceId,
      phase: 'contact_catalog',
      persistent: true,
      message: `Ainda existem ${remotePendingBeforeCatalog.length} conversa(s) pendentes no WAHA. Vou zerar o backlog antes de catalogar.`,
      meta: {
        remotePending: remotePendingBeforeCatalog.length,
      },
    });
    return {
      cataloged: 0,
      scoredQueued: 0,
      reason: 'backlog_pending',
    };
  }

  const days = Math.max(
    1,
    Number(data?.days || CIA_CONTACT_CATALOG_LOOKBACK_DAYS) || CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
  );
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const chats: RemoteChatSummary[] = (await whatsappApiProvider
    .getChats(workspaceId)
    .catch((): RemoteChatSummary[] => [])) as RemoteChatSummary[];
  const lidMap = buildLidMap((await whatsappApiProvider.getLidMappings(workspaceId).catch(() => [])) as Array<{ lid?: string | null; pn?: string | null }>);
  const eligibleChatMap = new Map<string, UnknownRecord>();
  for (const chat of Array.isArray(chats) ? chats : []) {
    const chatId = String(chat?.id || '').trim();
    if (!isIndividualWahaChatId(chatId)) {
      continue;
    }

    const phone = resolveCatalogPhoneFromChatId(chatId, lidMap);
    const activityTimestamp = resolveCatalogChatActivityTimestamp(chat);
    if (
      !phone ||
      isWorkspaceSelfTarget({
        phone,
        chatId,
        selfIdentity,
      }) ||
      activityTimestamp < cutoff
    ) {
      continue;
    }

    const current = eligibleChatMap.get(phone);
    if (!current || activityTimestamp > current.activityTimestamp) {
      eligibleChatMap.set(phone, {
        chat,
        chatId,
        canonicalChatId: resolveCanonicalChatId(chatId, lidMap),
        phone,
        activityTimestamp,
      });
    }
  }

  const eligibleChats = Array.from(eligibleChatMap.values())
    .sort(
      (left: UnknownRecord, right: UnknownRecord) =>
        right.activityTimestamp - left.activityTimestamp,
    )
    .slice(0, CIA_CONTACT_CATALOG_MAX_CHATS);

  let cataloged = 0;
  let scoredQueued = 0;

  await forEachSequential(eligibleChats, async (item) => {
    const chat = item.chat;
    const chatId = item.chatId;
    const canonicalChatId = item.canonicalChatId || chatId;
    const phone = item.phone;
    if (
      !phone ||
      isWorkspaceSelfTarget({
        phone,
        chatId,
        selfIdentity,
      })
    ) {
      return;
    }

    const existingContact = await prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      select: {
        name: true,
        customFields: true,
      },
    });
    const existingCustomFields = normalizeJsonObject(existingContact?.customFields);
    const remotePushName = String(existingCustomFields.remotePushName || '').trim();
    const existingStoredName = String(existingContact?.name || '').trim();
    const isPlaceholderName = (value: string) => {
      const normalized = String(value || '').trim();
      const lowered = normalized.toLowerCase();
      return (
        !normalized ||
        lowered === 'doe' ||
        lowered === 'unknown' ||
        lowered === 'desconhecido' ||
        D__D_S____S_DOE_RE.test(normalized) ||
        lowered === `${phone} doe` ||
        normalized.replace(NON_DIGIT_RE, '') === phone
      );
    };
    const remoteName =
      (!isPlaceholderName(remotePushName) ? remotePushName : '') ||
      extractCatalogChatName(chat, phone) ||
      (!isPlaceholderName(existingStoredName) ? existingStoredName : '');
    const contact = await prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      update: {
        name: remoteName || null,
        customFields: {
          ...existingCustomFields,
          catalogedAt: new Date().toISOString(),
          catalogSource: 'waha_catalog_30d',
          lastCatalogReason: String(data?.reason || 'catalog_job'),
          lastCatalogChatId: chatId,
          lastRemoteChatId: chatId,
          lastResolvedChatId: canonicalChatId,
          remotePushName: remoteName || undefined,
          remotePushNameUpdatedAt: remoteName
            ? new Date().toISOString()
            : existingCustomFields.remotePushNameUpdatedAt || undefined,
        },
      },
      create: {
        workspaceId,
        phone,
        name: remoteName || null,
        customFields: {
          catalogedAt: new Date().toISOString(),
          catalogSource: 'waha_catalog_30d',
          lastCatalogReason: String(data?.reason || 'catalog_job'),
          lastCatalogChatId: chatId,
          lastRemoteChatId: chatId,
          lastResolvedChatId: canonicalChatId,
          remotePushName: remoteName || undefined,
          remotePushNameUpdatedAt: remoteName ? new Date().toISOString() : undefined,
        },
      },
      select: {
        id: true,
      },
    });

    const savedToWhatsapp = remoteName
      ? await whatsappApiProvider
          .upsertContactProfile(workspaceId, {
            phone,
            name: remoteName,
          })
          .catch(() => false)
      : false;

    if (savedToWhatsapp) {
      const existingCustomFields = normalizeJsonObject(
        (
          await prisma.contact
            .findUnique({
              where: {
                workspaceId_phone: {
                  workspaceId,
                  phone,
                },
              },
              select: { customFields: true },
            })
            .catch(() => null /* not found */)
        )?.customFields,
      );

      await prisma.contact.updateMany({
        where: { id: contact.id, workspaceId },
        data: {
          customFields: {
            ...existingCustomFields,
            whatsappSavedAt: new Date().toISOString(),
            catalogedAt: existingCustomFields.catalogedAt || new Date().toISOString(),
            catalogSource: 'waha_catalog_30d',
            lastCatalogReason: String(data?.reason || 'catalog_job'),
            lastCatalogChatId: chatId,
            lastRemoteChatId: chatId,
            lastResolvedChatId: canonicalChatId,
            remotePushName: remoteName || undefined,
            remotePushNameUpdatedAt: remoteName
              ? new Date().toISOString()
              : existingCustomFields.remotePushNameUpdatedAt || undefined,
          },
        },
      });
    }

    await upsertCatalogConversationShell({
      workspaceId,
      contactId: contact.id,
      lastMessageAt: new Date(item.activityTimestamp),
      unreadCount: Math.max(
        Number(chat?.unreadCount || chat?.unread || 0) || 0,
        resolveLastMessageFromMe(chat) === false ? 1 : 0,
      ),
    });

    cataloged += 1;

    try {
      await autopilotQueue.add(
        'score-contact',
        {
          workspaceId,
          contactId: contact.id,
          phone,
          chatId: canonicalChatId,
          reason: data?.reason || 'catalog_job',
        },
        {
          jobId: buildQueueJobId('score-contact', workspaceId, contact.id),
          removeOnComplete: true,
        },
      );
      scoredQueued += 1;
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      const message = String(errorInstanceofError?.message || '');
      if (!message.includes('Job is already waiting')) {
        log.warn('catalog_score_enqueue_failed', {
          workspaceId,
          contactId: contact.id,
          error: message,
        });
      }
    }
  });

  await setWorkspaceSilentLiveMode({
    workspaceId,
    reason: String(data?.reason || 'catalog_job'),
    catalogStatus: 'completed',
  });

  await publishAgentEvent({
    type: 'status',
    workspaceId,
    phase: 'contact_catalog',
    persistent: true,
    message: `Catálogo 30d atualizado. ${cataloged} contato(s) verificado(s) e ${scoredQueued} score(s) enfileirado(s).`,
    meta: {
      cataloged,
      scoredQueued,
      days,
    },
  });

  return { cataloged, scoredQueued, days };
}
