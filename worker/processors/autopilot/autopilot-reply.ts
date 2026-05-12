import { countReplyWords } from './autopilot-utils';
import {
  WHITESPACE_G_RE,
  LIST_BULLET_RE,
  EMOJI_GU_RE,
  EMOJI_U_RE,
  SENTENCE_SPLIT_RE,
} from './autopilot-types';

export function computeReplyStyleBudget(
  message: string,
  historyTurns = 0,
): {
  words: number;
  maxSentences: number;
  maxWords: number;
} {
  const words = countReplyWords(message);
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

  return {
    words,
    maxSentences,
    maxWords,
  };
}

export function finalizeReplyStyle(
  customerMessage: string,
  reply?: string | null,
  historyTurns = 0,
): string | undefined {
  const normalized = String(reply || '')
    .replace(WHITESPACE_G_RE, ' ')
    .replace(LIST_BULLET_RE, ' ')
    .trim();

  if (!normalized) {
    return undefined;
  }

  const budget = computeReplyStyleBudget(customerMessage, historyTurns);
  const allowEmoji = EMOJI_U_RE.test(customerMessage || '');
  const withoutEmoji = allowEmoji ? normalized : normalized.replace(EMOJI_GU_RE, '').trim();
  const sentenceMatches =
    withoutEmoji
      .match(SENTENCE_SPLIT_RE)
      ?.map((part) => part.trim())
      .filter(Boolean) || [];
  const effectiveSentenceBudget =
    sentenceMatches.length > budget.maxSentences &&
    sentenceMatches.length > 1 &&
    countReplyWords(sentenceMatches[0]) <= 2
      ? Math.min(budget.maxSentences + 1, sentenceMatches.length)
      : budget.maxSentences;
  const limitedSentences = (sentenceMatches.length > 0 ? sentenceMatches : [withoutEmoji]).slice(
    0,
    effectiveSentenceBudget,
  );
  const selectedSentences: string[] = [];
  let selectedWords = 0;

  for (const sentence of limitedSentences) {
    const sentenceWords = countReplyWords(sentence);
    if (!selectedSentences.length) {
      selectedSentences.push(sentence);
      selectedWords = sentenceWords;
      continue;
    }

    if (selectedSentences.length >= effectiveSentenceBudget) {
      break;
    }

    if (selectedWords + sentenceWords > budget.maxWords) {
      break;
    }

    selectedSentences.push(sentence);
    selectedWords += sentenceWords;
  }

  return selectedSentences.join(' ').trim() || withoutEmoji;
}

import { type QuotedCustomerMessage } from './autopilot-types';

export function buildMirroredReplyPlanFallback(
  customerMessages: QuotedCustomerMessage[],
  draftReply: string,
): Array<{ quotedMessageId: string; text: string }> {
  const normalizedDraft =
    finalizeReplyStyle(
      customerMessages[customerMessages.length - 1]?.content || '',
      draftReply,
      customerMessages.length,
    ) || draftReply;
  const sentences = normalizedDraft
    .match(SENTENCE_SPLIT_RE)
    ?.map((item) => item.trim())
    .filter(Boolean) || [normalizedDraft];

  if (customerMessages.length === 1) {
    return [
      {
        quotedMessageId: customerMessages[0].quotedMessageId as string,
        text:
          finalizeReplyStyle(customerMessages[0].content, normalizedDraft, 0) || normalizedDraft,
      },
    ];
  }

  return customerMessages.map((message, index) => {
    const sentence =
      sentences[index] ||
      (index === customerMessages.length - 1 ? normalizedDraft : `Entendi. ${normalizedDraft}`);

    return {
      quotedMessageId: message.quotedMessageId as string,
      text: finalizeReplyStyle(message.content, sentence, 0) || sentence,
    };
  });
}
