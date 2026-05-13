import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import {
  type UnknownRecord,
  type WorkspaceSelfIdentity,
  WORKSPACE_SELF_IDENTITY_TTL_MS,
  NON_DIGIT_RE,
  LINON_DIGIT_RE,
} from './shared';

const NON_LID_KEY_CHARS_RE = /[^a-z0-9]/gi;

const workspaceSelfIdentityCache = new Map<
  string,
  { expiresAt: number; identity: WorkspaceSelfIdentity }
>();

export function normalizeCatalogPhone(phone: string): string {
  return String(phone || '')
    .replace(NON_DIGIT_RE, '')
    .replace('@c.us', '')
    .replace('@s.whatsapp.net', '');
}

export function expandComparablePhoneVariants(value: string | null | undefined): string[] {
  const digits = normalizeCatalogPhone(String(value || ''));
  if (!digits) {
    return [];
  }

  const variants = new Set<string>([digits]);
  if (digits.startsWith('55') && digits.length > 11) {
    variants.add(digits.slice(2));
  }
  if (!digits.startsWith('55') && digits.length === 11) {
    variants.add(`55${digits}`);
  }

  return Array.from(variants);
}

export async function resolveWorkspaceSelfIdentity(
  workspaceId: string,
  settings?: UnknownRecord,
): Promise<WorkspaceSelfIdentity> {
  const testRuntime = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const cached = testRuntime ? null : workspaceSelfIdentityCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.identity;
  }

  const storedPhone = normalizeCatalogPhone(
    String(settings?.whatsappApiSession?.phoneNumber || ''),
  );
  const storedIds = Array.isArray(settings?.whatsappApiSession?.selfIds)
    ? settings.whatsappApiSession.selfIds.map((value: UnknownRecord) => String(value || '').trim())
    : [];

  let remoteInfo: UnknownRecord | null = null;
  if (!testRuntime) {
    remoteInfo = (await whatsappApiProvider
      .getClientInfo(workspaceId)
      .catch(() => null)) as UnknownRecord;
  }

  const remoteCandidates = [
    remoteInfo?.me?.id,
    remoteInfo?.me?.lid,
    remoteInfo?.me?._serialized,
    remoteInfo?.phone,
    remoteInfo?.phoneNumber,
    remoteInfo?.me?.phone,
  ]
    .map((value: UnknownRecord) => String(value || '').trim())
    .filter(Boolean);

  const resolvedPhone =
    storedPhone ||
    normalizeCatalogPhone(
      String(
        remoteInfo?.me?.phone ||
          remoteInfo?.phone ||
          remoteInfo?.phoneNumber ||
          remoteInfo?.me?.id ||
          '',
      ),
    ) ||
    null;

  const identity: WorkspaceSelfIdentity = {
    phone: resolvedPhone,
    ids: Array.from(new Set([...storedIds, ...remoteCandidates].filter(Boolean))),
  };

  if (!testRuntime) {
    workspaceSelfIdentityCache.set(workspaceId, {
      expiresAt: Date.now() + WORKSPACE_SELF_IDENTITY_TTL_MS,
      identity,
    });
  }

  return identity;
}

export function isWorkspaceSelfPhone(
  phone: string | null | undefined,
  workspaceSelfPhone?: string | null,
): boolean {
  const phoneVariants = expandComparablePhoneVariants(phone);
  const selfVariants = expandComparablePhoneVariants(workspaceSelfPhone);

  return phoneVariants.some((candidate) => selfVariants.includes(candidate));
}

export function isWorkspaceSelfTarget(input: {
  phone?: string | null | undefined;
  chatId?: string | null | undefined;
  selfIdentity?: WorkspaceSelfIdentity | null | undefined;
}): boolean {
  const selfIdentity = input.selfIdentity;
  if (!selfIdentity) {
    return false;
  }

  if (isWorkspaceSelfPhone(input.phone, selfIdentity.phone)) {
    return true;
  }

  const normalizedChatId = String(input.chatId || '').trim();
  if (!normalizedChatId) {
    return false;
  }

  return selfIdentity.ids.some((candidate) => {
    const normalizedCandidate = String(candidate || '').trim();
    if (!normalizedCandidate) {
      return false;
    }

    return (
      normalizedCandidate === normalizedChatId ||
      expandComparablePhoneVariants(normalizedCandidate).some((candidate) =>
        expandComparablePhoneVariants(normalizedChatId).includes(candidate),
      )
    );
  });
}

export function buildLidMap(
  mappings: Array<{ lid?: string | null; pn?: string | null }>,
): Map<string, string> {
  const normalized = new Map<string, string>();

  for (const mapping of mappings || []) {
    const lid = String(mapping?.lid || '').trim();
    const pn = String(mapping?.pn || '').trim();
    if (!lid || !pn) {
      continue;
    }

    normalized.set(lid, pn);
    normalized.set(lid.replace(LINON_DIGIT_RE, ''), pn);
    normalized.set(lid.replace(NON_LID_KEY_CHARS_RE, ''), pn);
  }

  return normalized;
}

export function resolveCanonicalChatId(chatId: string, lidMap?: Map<string, string>): string {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) {
    return '';
  }

  if (lidMap) {
    const mapped =
      lidMap.get(normalizedChatId) ||
      lidMap.get(normalizedChatId.replace(LINON_DIGIT_RE, '')) ||
      lidMap.get(normalizedChatId.replace(NON_LID_KEY_CHARS_RE, '')) ||
      '';
    if (mapped) {
      return mapped;
    }
  }

  return normalizedChatId;
}

export function resolveCatalogPhoneFromChatId(
  chatId: string,
  lidMap?: Map<string, string>,
): string {
  return normalizeCatalogPhone(resolveCanonicalChatId(chatId, lidMap));
}

export function resolveLastMessageFromMe(chat: UnknownRecord): boolean | null {
  if (typeof chat?.lastMessage?.fromMe === 'boolean') {
    return chat.lastMessage.fromMe;
  }
  if (typeof chat?.lastMessage?._data?.id?.fromMe === 'boolean') {
    return chat.lastMessage._data.id.fromMe;
  }
  if (typeof chat?.lastMessage?.id?.fromMe === 'boolean') {
    return chat.lastMessage.id.fromMe;
  }
  return null;
}

export function isIndividualWahaChatId(chatId: string): boolean {
  const normalized = String(chatId || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes('@g.us')) {
    return false;
  }
  if (normalized.includes('@newsletter')) {
    return false;
  }
  if (normalized === 'status@broadcast') {
    return false;
  }
  return true;
}

export function resolveCatalogChatActivityTimestamp(chat: UnknownRecord): number {
  const candidates = [
    chat?._chat?.conversationTimestamp,
    chat?._chat?.lastMessageRecvTimestamp,
    chat?.lastMessage?.timestamp,
    chat?.lastMessage?._data?.messageTimestamp,
    chat?.timestamp,
    chat?.lastMessageTimestamp,
    chat?.conversationTimestamp,
    chat?.lastMessageRecvTimestamp,
    chat?.last_time,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') {
      continue;
    }
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }

    const parsed = new Date(String(candidate)).getTime();
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}
