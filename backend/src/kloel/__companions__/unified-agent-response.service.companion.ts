import { WHITESPACE_RE } from '../kloel-reply-engine.helpers';

export function countResponseWords(value?: string | null): number {
  return Math.max(
    1,
    String(value || '')
      .trim()
      .split(WHITESPACE_RE)
      .filter(Boolean).length,
  );
}

export function computeReplyStyleBudget(
  message: string,
  historyTurns = 0,
): { words: number; maxSentences: number; maxWords: number } {
  const words = countResponseWords(message);
  let maxSentences = words <= 8 ? 2 : words <= 20 ? 3 : 4;
  let maxWords = Math.min(
    140,
    words <= 4 ? 26 : words <= 12 ? Math.max(24, words + 12) : Math.ceil(words * 1.8),
  );
  if (historyTurns >= 6) {
    maxSentences += 1;
    maxWords += 24;
  }
  if (historyTurns >= 10) {
    maxSentences += 1;
    maxWords += 36;
  }
  return { words, maxSentences: Math.min(6, maxSentences), maxWords: Math.min(220, maxWords) };
}

export function buildReplyStyleInstruction(message: string, historyTurns = 0): string {
  const budget = computeReplyStyleBudget(message, historyTurns);
  return `O cliente usou ${budget.words} palavra(s) e a conversa já tem ${historyTurns} turno(s) relevantes. Responda com no máximo ${budget.maxSentences} frase(s) e ${budget.maxWords} palavra(s). Pergunta curta pede resposta curta. Conversa longa permite resposta mais rica, mais humana e mais convincente. Termine, quando fizer sentido, com uma pergunta curta que puxe a próxima resposta do cliente.`;
}
