import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { type UnknownRecord } from './shared';
import {
  resolveWorkspaceSelfIdentity,
  isWorkspaceSelfTarget,
  resolveCanonicalChatId,
  resolveCatalogPhoneFromChatId,
  resolveCatalogChatActivityTimestamp,
  buildLidMap,
  isIndividualWahaChatId,
} from './identity-resolve';

export async function buildEligibleCatalogChats(
  workspaceId: string,
  settings: UnknownRecord,
  days: number,
  maxChats: number,
) {
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const chats = (await whatsappApiProvider
    .getChats(workspaceId)
    .catch(() => [])) as UnknownRecord[];

  const lidMap = buildLidMap(
    (await whatsappApiProvider
      .getLidMappings(workspaceId)
      .catch(() => [])) as Array<{ lid?: string | null; pn?: string | null }>,
  );

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

  return {
    selfIdentity,
    eligibleChats: Array.from(eligibleChatMap.values())
      .sort(
        (left: UnknownRecord, right: UnknownRecord) =>
          right.activityTimestamp - left.activityTimestamp,
      )
      .slice(0, maxChats),
  };
}
