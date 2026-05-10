import { NON_DIGIT_RE, type UnknownRecord } from './shared';

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
