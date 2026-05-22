import { prisma } from '../../db';
import { findFirstSequential } from '../../utils/async-sequence';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { log, normalizeJsonObject, type UnknownRecord, type RemoteChatSummary } from './shared';
import {
  normalizeCatalogPhone,
  expandComparablePhoneVariants,
  resolveTrustedCatalogName,
  extractTrustedNameFromRemoteMessage,
  extractTrustedNameFromMessageText,
  extractRemoteMessageText,
  extractCatalogChatName,
} from './identity';

export async function ensureTrustedContactProfile(input: {
  workspaceId: string;
  contactId?: string | null | undefined;
  phone?: string | null | undefined;
  chatId?: string | null | undefined;
  contactName?: string | null | undefined;
  existingContact?: {
    id?: string | null;
    name?: string | null;
    customFields?: UnknownRecord;
  } | null;
}) {
  const normalizedPhone = normalizeCatalogPhone(String(input.phone || ''));
  const contactId = String(input.contactId || input.existingContact?.id || '').trim();

  if (!normalizedPhone || !contactId) {
    const seededContact = normalizedPhone
      ? await prisma.contact
          .upsert({
            where: {
              workspaceId_phone: {
                workspaceId: input.workspaceId,
                phone: normalizedPhone,
              },
            },
            update: {
              customFields: {
                lastRemoteChatId: String(input.chatId || '').trim() || undefined,
                lastResolvedChatId: String(input.chatId || '').trim() || undefined,
                nameResolutionStatus: 'pending',
              },
            },
            create: {
              workspaceId: input.workspaceId,
              phone: normalizedPhone,
              name: null,
              customFields: {
                lastRemoteChatId: String(input.chatId || '').trim() || undefined,
                lastResolvedChatId: String(input.chatId || '').trim() || undefined,
                nameResolutionStatus: 'pending',
              },
            },
            select: {
              id: true,
              name: true,
              customFields: true,
            },
          })
          .catch(() => null /* not found */)
      : null;

    if (!normalizedPhone || !seededContact?.id) {
      return {
        contactId: '',
        trustedName: '',
        savedToWhatsapp: false,
      };
    }

    input = {
      ...input,
      contactId: seededContact.id,
      existingContact: seededContact as {
        id?: string | null;
        name?: string | null;
        customFields?: UnknownRecord;
      } | null,
    };
  }

  const existingContact =
    input.existingContact ||
    (await prisma.contact
      .findUnique({
        where: { id: contactId },
        select: {
          id: true,
          name: true,
          customFields: true,
        },
      })
      .catch(() => null /* not found */));
  const ensuredContactId = String(input.contactId || existingContact?.id || '').trim();

  const existingCustomFields = normalizeJsonObject(existingContact?.customFields);
  let trustedName = resolveTrustedCatalogName(
    normalizedPhone,
    input.contactName,
    existingContact?.name,
    existingCustomFields.remotePushName,
    existingCustomFields.remoteContactName,
    existingCustomFields.verifiedBizName,
  );

  const chatCandidates = Array.from(
    new Set(
      [
        String(input.chatId || '').trim(),
        String(existingCustomFields.lastRemoteChatId || '').trim(),
        String(existingCustomFields.lastCatalogChatId || '').trim(),
        String(existingCustomFields.lastResolvedChatId || '').trim(),
        `${normalizedPhone}@c.us`,
        `${normalizedPhone}@s.whatsapp.net`,
      ].filter(Boolean),
    ),
  );

  if (!trustedName) {
    await findFirstSequential(chatCandidates, async (candidate) => {
      const remoteMessages = await whatsappApiProvider
        .getChatMessages(input.workspaceId, candidate, {
          limit: 5,
          offset: 0,
          downloadMedia: false,
        })
        .catch(() => []);

      if (!Array.isArray(remoteMessages) || remoteMessages.length === 0) {
        return undefined;
      }

      for (const remoteMessage of remoteMessages) {
        const remoteTrustedName = extractTrustedNameFromRemoteMessage(
          remoteMessage as UnknownRecord,
          normalizedPhone,
        );
        const textTrustedName = extractTrustedNameFromMessageText(
          extractRemoteMessageText(remoteMessage as UnknownRecord),
          normalizedPhone,
        );
        if (remoteTrustedName || textTrustedName) {
          trustedName = remoteTrustedName || textTrustedName;
          break;
        }
      }

      if (trustedName) {
        return true;
      }
      return undefined;
    });
  }

  if (!trustedName) {
    const phoneVariants = expandComparablePhoneVariants(normalizedPhone);
    const remoteChats: RemoteChatSummary[] = (await whatsappApiProvider
      .getChats(input.workspaceId)
      .catch((): RemoteChatSummary[] => [])) as RemoteChatSummary[];

    for (const chat of Array.isArray(remoteChats) ? remoteChats : []) {
      const remoteChatId = String(chat?.id || chat?.chatId || '').trim();
      const remotePhoneCandidates = [
        String(chat?.phone || '').trim(),
        String(chat?.contact?.phone || '').trim(),
        normalizeCatalogPhone(remoteChatId),
      ].filter(Boolean);
      const matchesCandidateChat = !!remoteChatId && chatCandidates.includes(remoteChatId);
      const matchesPhone = remotePhoneCandidates.some((candidate) =>
        expandComparablePhoneVariants(candidate).some((variant) => phoneVariants.includes(variant)),
      );

      if (!matchesCandidateChat && !matchesPhone) {
        continue;
      }

      trustedName = resolveTrustedCatalogName(
        normalizedPhone,
        extractCatalogChatName(chat, normalizedPhone),
        chat?.name,
        chat?.pushName,
        chat?.shortName,
        chat?.contact?.name,
        chat?.contact?.pushName,
        chat?._data?.notifyName,
        chat?._data?.verifiedBizName,
      );

      if (trustedName) {
        break;
      }
    }
  }

  if (!trustedName) {
    await prisma.contact
      .update({
        where: { id: ensuredContactId },
        data: {
          customFields: {
            ...existingCustomFields,
            lastRemoteChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastRemoteChatId || '').trim() ||
              undefined,
            lastResolvedChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastResolvedChatId || '').trim() ||
              undefined,
            nameResolutionStatus: 'pending',
            contactProfileEnsuredAt: new Date().toISOString(),
          },
        },
      })
      .catch((err) => {
        log.warn('contact_upsert_pending_failed', { error: err?.message });
        return undefined;
      });

    return {
      contactId: ensuredContactId,
      trustedName: '',
      savedToWhatsapp: false,
    };
  }

  await prisma.contact
    .update({
      where: { id: ensuredContactId },
      data: {
        name: trustedName,
        customFields: {
          ...existingCustomFields,
          remotePushName: trustedName,
          remotePushNameUpdatedAt: new Date().toISOString(),
          lastRemoteChatId:
            String(input.chatId || '').trim() ||
            String(existingCustomFields.lastRemoteChatId || '').trim() ||
            undefined,
          lastResolvedChatId:
            String(input.chatId || '').trim() ||
            String(existingCustomFields.lastResolvedChatId || '').trim() ||
            undefined,
          nameResolutionStatus: 'resolved',
          contactProfileEnsuredAt: new Date().toISOString(),
        },
      },
    })
    .catch((err) => {
      log.warn('contact_update_resolved_failed', { error: err?.message });
      return undefined;
    });

  const savedToWhatsapp = await whatsappApiProvider
    .upsertContactProfile(input.workspaceId, {
      phone: normalizedPhone,
      name: trustedName,
    })
    .catch((err) => {
      log.warn('upsert_contact_profile_failed', { error: err?.message, phone: normalizedPhone });
      return false;
    });

  if (savedToWhatsapp) {
    await prisma.contact
      .update({
        where: { id: ensuredContactId },
        data: {
          customFields: {
            ...existingCustomFields,
            remotePushName: trustedName,
            remotePushNameUpdatedAt: new Date().toISOString(),
            whatsappSavedAt: new Date().toISOString(),
            lastRemoteChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastRemoteChatId || '').trim() ||
              undefined,
            lastResolvedChatId:
              String(input.chatId || '').trim() ||
              String(existingCustomFields.lastResolvedChatId || '').trim() ||
              undefined,
            nameResolutionStatus: 'resolved',
            contactProfileEnsuredAt: new Date().toISOString(),
          },
        },
      })
      .catch(() => undefined);
  }

  return {
    contactId: ensuredContactId,
    trustedName,
    savedToWhatsapp,
  };
}
