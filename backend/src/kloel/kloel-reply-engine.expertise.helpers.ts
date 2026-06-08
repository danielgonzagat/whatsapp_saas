import {
  WHITESPACE_RE,
  RELAT_O__RIO_DOCUMENTO_RE,
  CRIE_CADASTRAR_CADASTRE_RE,
  PRODUTO_CAT_A__LOGO_AUT_RE,
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED,
} from './kloel-reply-engine.helpers';
import type { ExpertiseLevel, ReplyMessage } from './kloel-reply-engine.types';
/** Detect expertise level from message content and recent conversation history. */
export function detectExpertiseLevel(
  message: string,
  history: ReplyMessage[] = [],
): ExpertiseLevel {
  const combined = [message, ...history.slice(-6).map((e) => e.content || '')]
    .join(' ')
    .toLowerCase();
  const expertSignals = [
    'latência',
    'backpressure',
    'idempot',
    'throughput',
    'benchmark',
    'trade-off',
    'event-driven',
    'sse',
    'webhook',
    'prisma',
    'postgres',
    'fallback',
    'observabilidade',
  ];
  const advancedSignals = [
    'api',
    'integra',
    'crm',
    'automa',
    'segmenta',
    'conversão',
    'cta',
    'pipeline',
    'copilot',
    'autopilot',
    'checkout',
    'upsell',
  ];
  const expertScore = expertSignals.filter((s) => combined.includes(s)).length;
  const advancedScore = advancedSignals.filter((s) => combined.includes(s)).length;
  if (expertScore >= 3) {
    return 'EXPERT';
  }
  if (expertScore >= 1 || advancedScore >= 5) {
    return 'AVANÇADO';
  }
  if (
    advancedScore >= 2 ||
    String(message || '')
      .trim()
      .split(WHITESPACE_RE).length >= 14
  ) {
    return 'INTERMEDIÁRIO';
  }
  return 'INICIANTE';
}
/** Returns true when the message looks like a long-form / report request. */
export function shouldUseLongFormBudget(message: string): boolean {
  return RELAT_O__RIO_DOCUMENTO_RE.test(
    String(message || '')
      .trim()
      .toLowerCase(),
  );
}
/** Returns true when the message likely needs a tool-planning pre-pass. */
export function shouldAttemptToolPlanningPass(message: string): boolean {
  const normalized = String(message || '')
    .trim()
    .toLowerCase();
  if (!normalized || /ideias?/.test(normalized)) {
    return false;
  }
  if (CRIE_CADASTRAR_CADASTRE_RE.test(normalized) && PRODUTO_CAT_A__LOGO_AUT_RE.test(normalized)) {
    return true;
  }
  if (
    /\b(agent\s+trace|execution\s+trace|trajet[oó]ria|pré-resposta|pre-resposta|racioc[ií]nio|observa[cç][oõ]es|ferramentas?\s+internas?|codigo\s+fonte|c[oó]digo\s+fonte)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }
  return /\b(liste|listar|mostre|mostrar|busque|buscar|pesquise|pesquisar|procure|procurar|consulte|consultar|verifique|verificar|analise|analisar|resuma|resumo|status|dashboard|produtos?|leads?|contatos?|conversas?|whatsapp|mensagens?|evid[eê]ncias?|mem[oó]ria|sess(ões|oes)|jobs?|billing|cobran[çc]a|faturamento|receita|vendas?|pagamentos?)\b/i.test(
    normalized,
  );
}
/** Returns true when the stream abort reason is a client disconnect. */
export function isClientDisconnected(reason: unknown): boolean {
  return reason === KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED;
}
