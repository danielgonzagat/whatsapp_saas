export type UnknownRecord = Record<string, ReturnType<typeof JSON.parse>>;

export type RemoteChatSummary = {
  id?: string;
  chatId?: string;
  phone?: string;
  name?: string;
  pushName?: string;
  shortName?: string;
  contact?: {
    phone?: string;
    name?: string;
    pushName?: string;
    _data?: UnknownRecord;
  };
  _data?: UnknownRecord;
  timestamp?: number;
  lastMessageTimestamp?: number;
  [key: string]: unknown;
};

export type WorkspaceSelfIdentity = {
  phone: string | null;
  ids: string[];
};

export type ConversationHistoryEntry = {
  content: string | null;
  direction: string | null;
  createdAt?: Date | string | null;
};

export type AutopilotDecision = {
  intent: string;
  action: string;
  reason?: string;
  confidence?: number;
  usedHistory?: boolean;
  usedKb?: boolean;
  alreadyExecuted?: boolean;
};

export type QuotedCustomerMessage = {
  content: string;
  quotedMessageId?: string | undefined;
  createdAt?: string | undefined;
};

export const WHITESPACE_G_RE = /\s+/g;
export const LIST_BULLET_RE = /\s*[-*\u2022]\s+/g;
export const EMOJI_GU_RE = /\p{Extended_Pictographic}/gu;
export const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]?/g;
export const JSON_FENCE_RE = /```json/gi;
export const CODE_FENCE_RE = /```/g;
export const JSON_FENCE_G_RE = /```json/g;
export const DIACRITICS_RE = /[\u0300-\u036f]/g;
export const NON_ALNUM_SPACE_RE = /[^a-z0-9\s]/g;
export const NON_DIGIT_RE = /\D/g;
export const SEPARATOR_G_RE = /[_-]+/g;

export const WHITESPACE_RE = /\s+/;
export const EMOJI_U_RE = /\p{Extended_Pictographic}/u;
export const LINON_DIGIT_RE = /@lid$/i;
export const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;
export const MEU_NOME____S_E__S_RE =
  /(?:meu nome(?:\s+e|\s+é)?|me chamo|sou o|sou a|aqui e o|aqui é o|aqui e a|aqui é a|pode me chamar de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*){0,3})/iu;
export const ASSINADO______S__ATEN_RE =
  /(?:assinado[:,]?\s*|atenciosamente[:,]?\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.-]*){0,3})/iu;
export const N_RE = /[\n!?]+/;
export const W________W_______A_ZA_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
export const RX_55_S__________D_2_RE = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/;
export const PRE_C__O_VALOR_QUANTO_CU_RE = /pre[cç]o|valor|quanto custa|investimento/i;
export const PRAZO_ENTREGA_QUANDO_CHE_RE = /prazo|entrega|quando chega|quanto tempo/i;
export const PIX_CART_A__O_BOLETO_PAG_RE = /pix|cart[aã]o|boleto|pagamento/i;
export const RESULTADO_FUNCIONA_COMO_RE = /resultado|funciona|como funciona|benef[ií]cio/i;
export const PROBLEMA_DOR_DIFICULDADE_RE = /problema|dor|dificuldade|obje[cç][aã]o/i;
export const S_S_RE = /\{[\s\S]*\}/;
export const J__S_COMPREI_JA_S_COMPR_RE =
  /(já\s*comprei|ja\s*comprei|comprei|paguei|pagamento aprovado|pedido confirmado|assinatura ativa)/i;
export const PIX_BOLETO_CART_A__O_CA_RE =
  /(pix|boleto|cart[aã]o|cartao|quando virar|assim que cair|me chama amanh[aã]|pagar|pagamento)/i;
export const QUERO_VOU_COMPRAR_COMO_RE =
  /(quero|vou comprar|como pago|manda o link|fecha comigo|posso pagar)/i;
export const QUANTO_VALOR_PRE_C__O_F_RE =
  /(quanto|valor|pre[cç]o|funciona|tem como|me manda|link|produto|servi[cç]o)/i;
export const PAGAMENTO_APROVADO_PAGA_RE =
  /(pagamento aprovado|pagamento confirmado|pix enviado|já paguei|ja paguei|comprei|compra aprovada|assinatura ativa|recebi acesso|recebeu acesso|pedido confirmado|nota fiscal)/i;
export const CURSO_PLANO_MENTORIA_PR_RE = /(curso|plano|mentoria|produto|assinatura|consultoria)/i;
export const OBRIGAD_VALEU_PERFEITO_RE =
  /(obrigad|valeu|perfeito|ótimo|otimo|gostei|funcionou|recebi acesso|amei)/i;
export const OBRIGAD_VALEU_PERFEITO_RE_2 = /(obrigad|valeu|perfeito|ótimo|otimo|gostei)/i;
export const PRE_C__O_VALOR_QUANTO_O_RE = /(pre[cç]o|valor|quanto|or[cç]amento|plano|mensalidade)/i;
export const QUERO_VOU_COMPRAR_ME_MA_RE =
  /(quero|vou comprar|me manda o link|como pago|pix|boleto|cart[aã]o|fechar|assinar)/i;
export const PROBLEMA_ERRO_SUPORTE_A_RE = /(problema|erro|suporte|ajuda|reclama|cancelar)/i;
export const PROBLEMA_RUIM_HORR_I__V_RE = /(problema|ruim|horr[ií]vel|cancelar|reclama)/i;
export const QUERO_COMPRAR_ASSINAR_F_RE = /(quero|comprar|assinar|fechar|como pago|pix|boleto)/i;
export const PROBLEMA_ERRO_SUPORTE_A_RE_2 = /(problema|erro|suporte|ajuda)/i;
export const RECLAMA_CANCELAR_RE = /(reclama|cancelar)/i;
export const CARO_SEM_DINHEIRO_AGORA_RE =
  /(caro|sem dinheiro|agora não|agora nao|depois|sem tempo)/i;
export const SUMI_SEM_RESPOSTA_DEPOI_RE = /(sumi|sem resposta|depois te chamo|vou ver)/i;
export const B_SOU_HOMEM_MEU_MARIDO_RE = /\b(sou homem|meu marido|pai|rapaz)\b/i;
export const B_SOU_MULHER_MINHA_ESPO_RE = /\b(sou mulher|minha esposa|mãe|mae|moça|moca)\b/i;
export const B__D_2___S_ANOS_B_RE = /\b(\d{2})\s*anos\b/i;
export const B___SOU_DE_MORO_EM_AQUI_RE = /\b(?:sou de|moro em|aqui em)\s+([a-zà-ÿ' -]{2,40})/i;
