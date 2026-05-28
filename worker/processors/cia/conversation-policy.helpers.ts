/**
 * Pure helpers extracted from `worker/processors/cia/conversation-policy.ts`
 * so they can be unit-tested in isolation. Behaviour is byte-identical to
 * the original inline implementations.
 *
 * Keep this module free of side effects: no I/O, no Prisma, no providers,
 * no module-level state. Every function here is deterministic over its
 * inputs.
 */

import type {
  CognitiveActionType,
  CustomerCognitiveState,
  CustomerStage,
} from './cognitive-state';

const DIACRITICS_RE = /[̀-ͯ]/g;
const WHITESPACE_RE = /\s+/;
const ANSIOS_INSEGUR_MEDO_REC_RE = /(ansios|insegur|medo|receio|duvida|duvida)/i;
const FRUSTR_CANSAD_IRRIT_RAI_RE =
  /(frustr|cansad|irrit|raiva|sac|complicad|dif[íi]cil|problema|erro)/i;
const AMEI_PERFEITO_ANIMAD_GO_RE = /(amei|perfeito|animad|gostei|legal|excelente|top)/i;
const NAO_ENTENDI_N_A__O_ENTE_RE = /(nao entendi|n[aã]o entendi|confuso|como assim|explica)/i;
const OBRIGAD_VALEU__TIMO_OTI_RE = /(obrigad|valeu|ótimo|otimo)/i;
const NAO_N_A__O_RUIM_CARO_DE_RE = /(nao|n[aã]o|ruim|caro|demora|medo)/i;
const B_MEU_MINHA_MEUS_MINHAS_RE =
  /\b(meu|minha|meus|minhas|trabalho|empresa|rotina|familia|cliente)\b/i;
const PROBLEMA_ERRO_RECLAMA_N_RE =
  /(problema|erro|reclama|nao funciona|nao resolveu|demora|frustr)/i;

/** Active listening signals shape — exported via the barrel. */
export type ActiveListeningSignals = {
  emotionalTone:
    | 'positive'
    | 'negative'
    | 'neutral'
    | 'frustrated'
    | 'excited'
    | 'anxious'
    | 'confused';
  validationNeeded: boolean;
  personalDetailShared: boolean;
  complaintDetected: boolean;
  deepeningQuestion: string | null;
  openLoopOpportunity: string | null;
  inferredNeed: string | null;
};

/**
 * Lowercase + NFD-decompose + strip diacritics. Stable for `undefined`/`null`.
 */
export function normalizeText(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '');
}

const EMOTIONAL_TONE_RULES: ReadonlyArray<{
  pattern: RegExp;
  tone: ActiveListeningSignals['emotionalTone'];
}> = [
  { pattern: ANSIOS_INSEGUR_MEDO_REC_RE, tone: 'anxious' },
  { pattern: FRUSTR_CANSAD_IRRIT_RAI_RE, tone: 'frustrated' },
  { pattern: AMEI_PERFEITO_ANIMAD_GO_RE, tone: 'excited' },
  { pattern: NAO_ENTENDI_N_A__O_ENTE_RE, tone: 'confused' },
  { pattern: OBRIGAD_VALEU__TIMO_OTI_RE, tone: 'positive' },
  { pattern: NAO_N_A__O_RUIM_CARO_DE_RE, tone: 'negative' },
];

/**
 * Map a normalized text fragment to a single emotional tone label. Falls
 * back to `'neutral'` when no rule matches. Rule order is significant —
 * the first match wins.
 */
export function inferEmotionalTone(text: string): ActiveListeningSignals['emotionalTone'] {
  for (const rule of EMOTIONAL_TONE_RULES) {
    if (rule.pattern.test(text)) {
      return rule.tone;
    }
  }
  return 'neutral';
}

/** Stage-specific PT-BR directive injected into the system prompt. */
export function buildStageDirective(
  stage: CustomerStage,
  trust: number,
  urgency: number,
): string {
  switch (stage) {
    case 'COLD':
      return `ESTAGIO: FRIO
- O objetivo e acolher e entender a dor real.
- Nao ofereca produto cedo demais.
- Use uma pergunta aberta curta e inteligente para descobrir contexto.`;
    case 'WARM':
      return `ESTAGIO: AQUECIDO
- Aprofunde dor, objetivo e restricoes.
- Conecte o que a pessoa sente com um proximo passo claro.
- Se usar prova social, faca isso de forma casual.`;
    case 'HOT':
      return `ESTAGIO: QUENTE
- A pessoa ja mostrou intencao.
- Valide a decisao e reduza atrito.
- Confianca: ${Math.round(trust * 100)}% | Urgencia: ${Math.round(urgency * 100)}%`;
    case 'CHECKOUT':
      return `ESTAGIO: CHECKOUT
- Remova friccao e simplifique pagamento.
- Nao pressione.
- Foque em clareza, seguranca e proximo passo unico.`;
    case 'POST_SALE':
      return `ESTAGIO: POS-VENDA
- O foco e suporte, resultado e oportunidade de recompra sem forcar.`;
    case 'SUPPORT':
      return `ESTAGIO: SUPORTE
- Valide a frustracao antes de orientar.
- Nao tente vender antes de resolver ou encaminhar.`;
    default:
      return `ESTAGIO: INDEFINIDO
- Descubra contexto com uma pergunta aberta e curta.`;
  }
}

/**
 * Persuasion-block directives, modulated by trust/objections/stage.
 * Returns the literal default block when no cognitive state is provided.
 */
export function buildPersuasionDirective(state?: CustomerCognitiveState | null): string {
  if (!state) {
    return `PERSUASAO:
- Entregue valor antes de pedir algo.
- Priorize clareza, empatia e um proximo passo simples.`;
  }

  const directives: string[] = [
    '- RECIPROCIDADE: entregue um insight util antes de empurrar a conversa.',
    '- AFINIDADE: espelhe o estilo do contato sem soar artificial.',
    '- UNIDADE: quando fizer sentido, enquadre a situacao como algo comum ao perfil do contato.',
  ];

  if (state.objections.includes('trust') || state.trustScore < 0.6) {
    directives.push(
      '- PROVA SOCIAL: mencione com naturalidade um caso parecido, sem formato de depoimento.',
    );
  }

  if (state.objections.includes('price')) {
    directives.push(
      '- VALOR: responda preco em contexto de resultado e reducao de risco, nao com discurso duro.',
    );
  }

  if (state.stage === 'HOT' || state.stage === 'CHECKOUT') {
    directives.push(
      '- COMPROMISSO: proponha um proximo passo unico e facil, sem duas perguntas na mesma mensagem.',
    );
  }

  return `PERSUASAO:\n${directives.join('\n')}`;
}

const ACTION_BASE_BY_TYPE: Readonly<Record<string, string>> = {
  RESPOND:
    'Responda primeiro o que o cliente quis dizer e depois conduza com uma unica pergunta ou proximo passo.',
  ASK_CLARIFYING: 'Qualifique melhor a necessidade com uma pergunta aberta e humana.',
  SOCIAL_PROOF: 'Reduza inseguranca com clareza e prova social sutil.',
  OFFER: 'Conecte a solucao ao que o cliente valorizou e simplifique o avanco.',
  FOLLOWUP_SOFT: 'Retome de forma leve, sem cobrar ausencia, adicionando contexto util.',
  FOLLOWUP_URGENT: 'Traga relevancia temporal sem pressao e simplifique a retomada.',
  PAYMENT_RECOVERY: 'Remova atrito do pagamento com tom calmo, seguro e pratico.',
  WAIT: 'Nao force oferta. Se responder, seja minima, util e sem pressa.',
  ESCALATE_HUMAN: 'Oriente transicao para humano com acolhimento e seguranca.',
};

const TACTIC_HINTS: Readonly<Record<string, string>> = {
  EMPATHETIC_ECHO: 'Valide explicitamente a emocao antes de conduzir.',
  PAIN_PROBING: 'Aprofunde a dor ou restricao com uma pergunta aberta.',
  EPIPHANY_DROP: 'Entregue um insight curto que mude a perspectiva do contato.',
  STORYTELLING_HOOK: 'Use uma micro-historia ou analogia curta para criar conexao.',
  QUALIFY_PRIORITY: 'Descubra o que e prioridade real agora.',
  QUALIFY_NEED: 'Descubra a necessidade principal antes de ofertar.',
  PRICE_VALUE_REFRAME: 'Contextualize valor antes de falar em custo isolado.',
  TRUST_REASSURANCE: 'Passe seguranca com clareza e tom calmo.',
  SOCIAL_PROOF: 'Use um caso parecido de forma natural.',
  DIRECT_OFFER_CLOSE: 'Se o contato estiver pronto, seja direta e simples.',
  CHECKOUT_SIMPLIFICATION: 'Reduza friccao do proximo passo.',
  PAYMENT_RESOLUTION: 'Resolva o pagamento de forma objetiva.',
  FOLLOWUP_NUDGE: 'Retome sem parecer robo.',
  SAFE_URGENCY: 'Use urgencia contextualizada e limpa.',
};

/**
 * Compose the per-action directive (and optional tactic hint) injected
 * into the system prompt. Unknown action types fall back to a generic
 * progressive-response line; unknown tactic strings echo the raw label.
 */
export function buildActionDirective(
  action?: CognitiveActionType | string | null,
  tactic?: string | null,
): string {
  const base = ACTION_BASE_BY_TYPE[String(action || '').trim()] ||
    'Responda de forma humana, util e progressiva.';

  if (!tactic) {
    return base;
  }

  return `${base}\nTATICA: ${TACTIC_HINTS[tactic] || tactic}`;
}

const VALIDATION_TONES: ReadonlyArray<ActiveListeningSignals['emotionalTone']> = [
  'frustrated',
  'anxious',
  'confused',
];

/** Returns true when the tone label belongs to the validation-need set. */
export function isValidationTone(
  emotionalTone: ActiveListeningSignals['emotionalTone'],
): boolean {
  return VALIDATION_TONES.includes(emotionalTone);
}

/**
 * Decide whether the auto-reply must validate emotion before guiding.
 * Triggered by complaint detection, long messages (>18 words), or a
 * validation-needing tone.
 */
export function needsValidation(
  complaintDetected: boolean,
  wordCount: number,
  emotionalTone: ActiveListeningSignals['emotionalTone'],
): boolean {
  return complaintDetected || wordCount > 18 || isValidationTone(emotionalTone);
}

/** Substring `OR` over a normalized text — pure helper. */
export function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/**
 * Map a normalized message to an inferred need bucket. Returns null when
 * no bucket fits.
 */
export function inferNeed(normalized: string, personalDetailShared: boolean): string | null {
  if (includesAny(normalized, ['preco', 'valor', 'parcela'])) {
    return 'seguranca sobre investimento';
  }
  if (includesAny(normalized, ['prazo', 'urgente', 'hoje', 'agora'])) {
    return 'agilidade';
  }
  if (includesAny(normalized, ['funciona', 'garantia', 'resultado'])) {
    return 'confianca';
  }
  if (personalDetailShared) {
    return 'ser compreendido';
  }
  return null;
}

const DEEPENING_TONE_QUESTIONS: Partial<
  Record<ActiveListeningSignals['emotionalTone'], string>
> = {
  frustrated: 'O que mais te trava nisso hoje?',
  anxious: 'Qual parte te deixa mais inseguro agora?',
};

/**
 * Pick a deepening question to layer over the response. Tone match wins
 * first; otherwise inferred-need + personal-detail combine to choose.
 */
export function buildDeepeningQuestion(
  emotionalTone: ActiveListeningSignals['emotionalTone'],
  inferredNeed: string | null,
  personalDetailShared: boolean,
): string | null {
  const toneMatch = DEEPENING_TONE_QUESTIONS[emotionalTone];
  if (toneMatch) {
    return toneMatch;
  }
  if (inferredNeed === 'agilidade') {
    return 'O que voce precisa resolver primeiro?';
  }
  if (personalDetailShared) {
    return 'Quando isso acontece, o que pesa mais no seu dia a dia?';
  }
  return null;
}

/**
 * Pick an open-loop nudge tailored to the topic or, as a fallback, to a
 * personalized opener using the contact's first name.
 */
export function buildOpenLoopOpportunity(
  normalized: string,
  contactName: string | null | undefined,
): string {
  if (includesAny(normalized, ['resultado', 'funciona', 'preco', 'valor', 'prazo'])) {
    return 'Tem um detalhe nisso que costuma mudar a decisao.';
  }
  if (contactName) {
    const firstName = String(contactName).trim().split(WHITESPACE_RE)[0];
    return `${firstName}, tem um ponto aqui que quase sempre passa despercebido.`;
  }
  return 'Tem um ponto aqui que quase sempre passa despercebido.';
}

/** Word-count by whitespace split (filters empty tokens). */
export function countWords(normalized: string): number {
  return normalized.split(WHITESPACE_RE).filter(Boolean).length;
}

/**
 * Detects whether `normalized` carries the personal-detail markers AND
 * is long enough (>=8 words) to register as a genuine self-disclosure.
 */
export function detectPersonalDetailShared(
  normalized: string,
  wordCount: number,
): boolean {
  return B_MEU_MINHA_MEUS_MINHAS_RE.test(normalized) && wordCount >= 8;
}

/** Returns true when the normalized text contains a complaint pattern. */
export function detectComplaint(normalized: string): boolean {
  return PROBLEMA_ERRO_RECLAMA_N_RE.test(normalized);
}
