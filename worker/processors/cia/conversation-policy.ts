/**
 * ARCHITECTURAL COHESION: CIA Conversation Policy Engine — evaluates per-conversation
 * constraints for autopilot actions from a shared state object. All functions (silence window,
 * backoff policy, dispatch window, contact-level rate limiting, master kill switch) compute
 * boolean decisions fed by the same policy state. Splitting would scatter the decision rules
 * and require duplicating the shared-state traversal logic across modules.
 *
 * Pure leaf helpers (normalization, tone inference, directive builders,
 * listening sub-signals) live in `conversation-policy.helpers.ts` so they
 * can be unit-tested in isolation. Public API exports are re-exported here
 * to preserve the historical import surface.
 */

import type { CognitiveActionType, CustomerCognitiveState } from './cognitive-state';
import {
  type ActiveListeningSignals,
  buildActionDirective,
  buildDeepeningQuestion,
  buildOpenLoopOpportunity,
  buildPersuasionDirective,
  buildStageDirective,
  countWords,
  detectComplaint,
  detectPersonalDetailShared,
  inferEmotionalTone,
  inferNeed,
  needsValidation,
  normalizeText,
} from './conversation-policy.helpers';

export type { ActiveListeningSignals } from './conversation-policy.helpers';

const WHITESPACE_G_RE = /\s+/g;
const B_CONDI_C___A__O_ESPECI_RE =
  /\b(condi[cç][aã]o especial|oportunidade [uú]nica|imperd[ií]vel)\b/gi;
const QUESTION_MARK_RE = /\?/g;
const OI_OL_A___E_AI_OPA_RE = /^(oi|ol[aá]|e ai|opa)[!,.]?\s*/i;
const QUALQUER_D_U__VIDA_FI_RE =
  /(?:qualquer d[uú]vida|fico [aà] disposi[cç][aã]o|estou [aà] disposi[cç][aã]o).*$/i;

/** Analyze for active listening. */
export function analyzeForActiveListening(
  messageContent: string,
  contactName?: string | null,
): ActiveListeningSignals {
  const text = String(messageContent || '');
  const normalized = normalizeText(text);
  const wordCount = countWords(normalized);
  const emotionalTone = inferEmotionalTone(normalized);

  const personalDetailShared = detectPersonalDetailShared(normalized, wordCount);
  const complaintDetected = detectComplaint(normalized);
  const validationNeeded = needsValidation(complaintDetected, wordCount, emotionalTone);
  const inferredNeed = inferNeed(normalized, personalDetailShared);
  const deepeningQuestion = buildDeepeningQuestion(
    emotionalTone,
    inferredNeed,
    personalDetailShared,
  );
  const openLoopOpportunity = buildOpenLoopOpportunity(normalized, contactName);

  return {
    emotionalTone,
    validationNeeded,
    personalDetailShared,
    complaintDetected,
    deepeningQuestion,
    openLoopOpportunity,
    inferredNeed,
  };
}

const CONVERSATION_IDENTITY_BLOCK = [
  'IDENTIDADE:',
  '- Soe humana, segura, viva e consultiva.',
  '- Nao finja ser humana. Se perguntarem diretamente, diga com naturalidade que voce e a assistente virtual da empresa.',
  '- Nao use emoji por padrao e nao escreva como template.',
] as const;

const CONVERSATION_HOW_TO_RESPOND_BLOCK = [
  'COMO RESPONDER:',
  '- Responda primeiro o que o contato quis dizer.',
  '- Valide a emocao antes de empurrar informacao quando houver frustracao, ansiedade ou confusao.',
  '- Use uma unica pergunta por mensagem quando estiver conduzindo.',
  '- Se a mensagem dele foi curta, seja curta. Se foi rica, aprofunde sem virar bloco burocratico.',
  '- Toda resposta deve ter valor concreto, contexto humano ou proximo passo claro.',
  '- Considere o historico integral da conversa como fonte primaria.',
  '- Nunca repita pergunta, assunto, historia, dado pedido ou oferta que ja aparecam no historico integral.',
] as const;

function buildListeningSignalsBlock(listening?: ActiveListeningSignals | null): string[] {
  return [
    'SINAIS DA CONVERSA:',
    `- Tom emocional: ${listening?.emotionalTone || 'neutral'}`,
    `- Precisa validacao: ${listening?.validationNeeded ? 'sim' : 'nao'}`,
    `- Necessidade inferida: ${listening?.inferredNeed || 'nao identificada'}`,
    `- Contexto pessoal compartilhado: ${listening?.personalDetailShared ? 'sim' : 'nao'}`,
  ];
}

function buildConversationContextBlock(params: {
  compressedContext?: string | null | undefined;
  conversationHistory?: string | null | undefined;
  conversationLedger?: string | null | undefined;
  productSummary?: string | null | undefined;
  matchedProducts?: string[] | undefined;
}): string[] {
  const matchedProducts = params.matchedProducts?.length
    ? params.matchedProducts.join(', ')
    : 'nenhum';
  return [
    'CONTEXTO DO CONTATO:',
    params.compressedContext || 'Sem resumo persistido.',
    '',
    'LEDGER INTEGRAL DO CONTATO:',
    params.conversationLedger || 'Sem ledger acumulado.',
    '',
    'HISTORICO INTEGRAL DA CONVERSA:',
    params.conversationHistory || 'Sem historico integral.',
    '',
    'PRODUTOS DISPONIVEIS:',
    params.productSummary || 'Nenhum produto cadastrado.',
    '',
    `PRODUTOS MAIS RELEVANTES NESTA CONVERSA: ${matchedProducts}`,
  ];
}

/** Build whats app conversation prompt. */
export function buildWhatsAppConversationPrompt(params: {
  workspaceName: string;
  contactName?: string | null | undefined;
  compressedContext?: string | null | undefined;
  productSummary?: string | null | undefined;
  conversationHistory?: string | null | undefined;
  conversationLedger?: string | null | undefined;
  matchedProducts?: string[] | undefined;
  cognitiveState?: CustomerCognitiveState | null | undefined;
  listeningSignals?: ActiveListeningSignals | null | undefined;
  deliveryMode?: string | undefined;
  action?: CognitiveActionType | string | null | undefined;
  tactic?: string | null | undefined;
}): string {
  const state = params.cognitiveState;
  const stage = state?.stage || 'COLD';
  const trust = Number(state?.trustScore || 0.45);
  const urgency = Number(state?.urgencyScore || 0.2);
  const live = params.deliveryMode === 'reactive';

  return [
    `Voce responde no WhatsApp da ${params.workspaceName}.`,
    `Voce esta falando com ${params.contactName || 'o contato'}.`,
    '',
    ...CONVERSATION_IDENTITY_BLOCK,
    '',
    ...CONVERSATION_HOW_TO_RESPOND_BLOCK,
    '',
    buildStageDirective(stage, trust, urgency),
    '',
    buildPersuasionDirective(state),
    '',
    `DIRETIVA DE ACAO:\n${buildActionDirective(params.action, params.tactic)}`,
    '',
    ...buildListeningSignalsBlock(params.listeningSignals),
    '',
    ...buildConversationContextBlock(params),
    '',
    live
      ? 'A conversa esta ao vivo. Responda acompanhando o ritmo do contato.'
      : 'Esta e uma retomada ou resposta estrategica. Soe natural, sem cobrar ausencia.',
  ].join('\n');
}

/** Detect and fix anti patterns. */
export function detectAndFixAntiPatterns(reply?: string | null): string {
  let fixed = String(reply || '')
    .replace(WHITESPACE_G_RE, ' ')
    .trim();

  fixed = fixed.replace(OI_OL_A___E_AI_OPA_RE, '');
  fixed = fixed.replace(B_CONDI_C___A__O_ESPECI_RE, 'algo que faz sentido pra sua situacao');
  fixed = fixed.replace(QUALQUER_D_U__VIDA_FI_RE, '');

  const questions = fixed.match(QUESTION_MARK_RE) || [];
  if (questions.length > 1) {
    const firstQuestionIndex = fixed.indexOf('?');
    if (firstQuestionIndex >= 0) {
      const before = fixed.slice(0, firstQuestionIndex + 1);
      const after = fixed
        .slice(firstQuestionIndex + 1)
        .replace(QUESTION_MARK_RE, '.')
        .replace(WHITESPACE_G_RE, ' ')
        .trim();
      fixed = `${before}${after ? ` ${after}` : ''}`.trim();
    }
  }

  return fixed.trim();
}
