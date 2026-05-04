/**
 * Compiled regex constants + ReDoS-bounded input helper for the
 * UnifiedAgentResponseService. Hoisted to a sibling file so the
 * service module stays under the architecture line budget.
 */

export const WHITESPACE_G_RE = /\s+/g;
export const S_______S_RE = /\s*[-*•]\s+/g;
export const P_EXTENDED_PICTOGRAPHIC_G_RE = /\p{Extended_Pictographic}/gu;
export const PATTERN_RE_2 = /[^.!?]+[.!?]?/g;
export const JSON_RE = /```json/gi;
export const PATTERN_RE_3 = /```/g;
export const WHITESPACE_RE = /\s+/;
export const P_EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;

export const PRE_C__O_QUANTO_VALOR_C_RE =
  /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i;
export const AGENDAR_AGENDA_REUNI_A_RE = /(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i;
export const CANCEL_CANCELAR_REEMBOL_RE = /(cancel|cancelar|reembolso|desist|encerrar)/i;
export const OL__A__BOM_DIA_BOA_TARD_RE = /(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i;

/**
 * Maximum number of characters of customer-supplied text that we ever feed to
 * any regular expression scan in this file. Bounding the input length is the
 * cheapest, most reliable defense against ReDoS — even for linear-time regexes
 * like the single-codepoint `Extended_Pictographic` test below.
 */
export const MAX_REGEX_INPUT_LEN = 4_096;

/** Truncates user-supplied input before any regex scan to neutralize ReDoS surface. */
export function safeForRegex(input: string | null | undefined): string {
  if (!input) {
    return '';
  }
  return input.length > MAX_REGEX_INPUT_LEN ? input.slice(0, MAX_REGEX_INPUT_LEN) : input;
}
