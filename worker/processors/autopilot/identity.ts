import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import {
  type UnknownRecord,
  type WorkspaceSelfIdentity,
  WORKSPACE_SELF_IDENTITY_TTL_MS,
  NON_DIGIT_RE,
  LINON_DIGIT_RE,
} from './shared';

const workspaceSelfIdentityCache = new Map<
  string,
  { expiresAt: number; identity: WorkspaceSelfIdentity }
>();

const WHITESPACE_G_RE = /\s+/g;
const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;
const MEU_NOME____S_E__S_RE =
  /(?:meu nome(?:\s+e|\s+é)?|me chamo|sou o|sou a|aqui e o|aqui é o|aqui e a|aqui é a|pode me chamar de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*){0,3})/iu;
const ASSINADO______S__ATEN_RE =
  /(?:assinado[:,]?\s*|atenciosamente[:,]?\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*){0,3})/iu;
const N_RE = /[\n!?]+/;
const W________W_______A_ZA_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const RX_55_S__________D_2_RE = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/;
const PRE_C__O_VALOR_QUANTO_CU_RE = /pre[cç]o|valor|quanto custa|investimento/i;
const PRAZO_ENTREGA_QUANDO_CHE_RE = /prazo|entrega|quando chega|quanto tempo/i;
const PIX_CART_A__O_BOLETO_PAG_RE = /pix|cart[aã]o|boleto|pagamento/i;
const RESULTADO_FUNCIONA_COMO_RE = /resultado|funciona|como funciona|benef[ií]cio/i;
const PROBLEMA_DOR_DIFICULDADE_RE = /problema|dor|dificuldade|obje[cç][aã]o/i;

type ConversationHistoryEntry = {
  content: string | null;
  direction: string | null;
  createdAt?: Date | string | null;
};

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
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
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
      .catch(() => null /* not found */)) as UnknownRecord;
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
  selfIdentity?: WorkspaceSelfIdentity | null;
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
  }

  return normalized;
}

export function resolveCanonicalChatId(chatId: string, lidMap?: Map<string, string>): string {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) {
    return '';
  }

  if (LINON_DIGIT_RE.test(normalizedChatId) && lidMap) {
    const mapped =
      lidMap.get(normalizedChatId) ||
      lidMap.get(normalizedChatId.replace(LINON_DIGIT_RE, '')) ||
      '';
    if (mapped) {
      return mapped;
    }
  }

  return normalizedChatId;
}

export function resolveCatalogPhoneFromChatId(chatId: string, lidMap?: Map<string, string>): string {
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

export function extractCatalogChatName(chat: UnknownRecord, fallbackPhone?: string | null): string {
  const phoneDigits = String(fallbackPhone || '').replace(NON_DIGIT_RE, '');
  const candidates = [
    chat?.name,
    chat?.contact?.pushName,
    chat?.contact?.name,
    chat?.pushName,
    chat?.notifyName,
    chat?.lastMessage?._data?.notifyName,
    chat?.lastMessage?._data?.verifiedBizName,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    const lowered = normalized.toLowerCase();
    const isPlaceholder =
      !normalized ||
      lowered === 'doe' ||
      lowered === 'unknown' ||
      lowered === 'desconhecido' ||
      D__D_S____S_DOE_RE.test(normalized) ||
      (!!phoneDigits && lowered === `${phoneDigits} doe`) ||
      (!!phoneDigits && normalized.replace(NON_DIGIT_RE, '') === phoneDigits);
    if (!isPlaceholder) {
      return normalized;
    }
  }

  return '';
}

export function isPlaceholderCatalogName(value: unknown, fallbackPhone?: string | null): boolean {
  const normalized = String(value || '').trim();
  const lowered = normalized.toLowerCase();
  const phoneDigits = String(fallbackPhone || '').replace(NON_DIGIT_RE, '');

  if (!normalized) {
    return true;
  }

  if (lowered === 'doe' || lowered === 'unknown' || lowered === 'desconhecido') {
    return true;
  }

  if (D__D_S____S_DOE_RE.test(normalized)) {
    return true;
  }

  if (phoneDigits && lowered === `${phoneDigits} doe`) {
    return true;
  }

  if (phoneDigits && normalized.replace(NON_DIGIT_RE, '') === phoneDigits) {
    return true;
  }

  return false;
}

export function resolveTrustedCatalogName(
  fallbackPhone?: string | null,
  ...candidates: unknown[]
): string {
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (!isPlaceholderCatalogName(normalized, fallbackPhone)) {
      return normalized;
    }
  }

  return '';
}

export function extractTrustedNameFromRemoteMessage(
  message: UnknownRecord,
  fallbackPhone?: string | null,
): string {
  return resolveTrustedCatalogName(
    fallbackPhone,
    message?.pushName,
    message?.notifyName,
    message?.senderName,
    message?.contact?.pushName,
    message?.contact?.name,
    message?.author?.pushName,
    message?.author?.name,
    message?.sender?.pushName,
    message?.sender?.name,
    message?._data?.notifyName,
    message?._data?.verifiedBizName,
  );
}

export function extractTrustedNameFromMessageText(value: unknown, fallbackPhone?: string | null): string {
  const text = String(value || '')
    .replace(WHITESPACE_G_RE, ' ')
    .trim();
  if (!text) {
    return '';
  }

  const matchers = [MEU_NOME____S_E__S_RE, ASSINADO______S__ATEN_RE];

  for (const matcher of matchers) {
    const matched = text.match(matcher);
    if (!matched?.[1]) {
      continue;
    }

    const trusted = resolveTrustedCatalogName(fallbackPhone, matched[1]);
    if (trusted) {
      return trusted;
    }
  }

  return '';
}

export function extractRemoteMessageText(message: UnknownRecord): string {
  return String(
    message?.body ||
      message?.content ||
      message?.text ||
      message?.caption ||
      message?.message?.conversation ||
      message?.message?.extendedTextMessage?.text ||
      message?.message?.imageMessage?.caption ||
      message?.message?.videoMessage?.caption ||
      message?._data?.body ||
      '',
  )
    .replace(WHITESPACE_G_RE, ' ')
    .trim();
}

export function buildConversationLedger(history: ConversationHistoryEntry[]): {
  transcript: string;
  factsText: string;
} {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      transcript: '',
      factsText: 'Sem fatos acumulados.',
    };
  }

  const askedQuestions = new Set<string>();
  const informedFacts = new Set<string>();
  const coveredTopics = new Set<string>();

  const transcript = history
    .map((entry) => {
      const content = String(entry?.content || '')
        .replace(WHITESPACE_G_RE, ' ')
        .trim();
      if (!content) {
        return '';
      }

      const direction = String(entry?.direction || '').toUpperCase();
      const speaker = direction === 'INBOUND' ? 'Cliente' : 'Conta';
      const timestamp = entry?.createdAt
        ? new Date(entry.createdAt).toISOString()
        : 'sem_timestamp';

      if (direction === 'OUTBOUND') {
        const questions = content
          .split(N_RE)
          .map((part) => part.trim())
          .filter(Boolean);
        for (const question of questions) {
          if (content.includes('?')) {
            askedQuestions.add(question);
          }
        }
      }

      const extractedName = extractTrustedNameFromMessageText(content);
      if (extractedName) {
        informedFacts.add(`nome: ${extractedName}`);
      }

      const emailMatch = content.match(W________W_______A_ZA_RE);
      if (emailMatch?.[0]) {
        informedFacts.add(`email: ${emailMatch[0]}`);
      }

      const phoneMatch = content.match(RX_55_S__________D_2_RE);
      if (phoneMatch?.[0]) {
        informedFacts.add(`telefone: ${phoneMatch[0]}`);
      }

      if (PRE_C__O_VALOR_QUANTO_CU_RE.test(content)) {
        coveredTopics.add('preco');
      }
      if (PRAZO_ENTREGA_QUANDO_CHE_RE.test(content)) {
        coveredTopics.add('prazo');
      }
      if (PIX_CART_A__O_BOLETO_PAG_RE.test(content)) {
        coveredTopics.add('pagamento');
      }
      if (RESULTADO_FUNCIONA_COMO_RE.test(content)) {
        coveredTopics.add('resultado');
      }
      if (PROBLEMA_DOR_DIFICULDADE_RE.test(content)) {
        coveredTopics.add('problema');
      }

      return `[${timestamp}] ${speaker}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');

  const factsText = [
    informedFacts.size > 0
      ? `DADOS JA INFORMADOS:\n- ${Array.from(informedFacts).join('\n- ')}`
      : 'DADOS JA INFORMADOS:\n- nenhum dado estruturado detectado',
    askedQuestions.size > 0
      ? `PERGUNTAS JA FEITAS PELA CONTA:\n- ${Array.from(askedQuestions).join('\n- ')}`
      : 'PERGUNTAS JA FEITAS PELA CONTA:\n- nenhuma pergunta anterior detectada',
    coveredTopics.size > 0
      ? `TOPICOS JA COBERTOS:\n- ${Array.from(coveredTopics).join('\n- ')}`
      : 'TOPICOS JA COBERTOS:\n- nenhum topico detectado',
  ].join('\n\n');

  return {
    transcript,
    factsText,
  };
}
