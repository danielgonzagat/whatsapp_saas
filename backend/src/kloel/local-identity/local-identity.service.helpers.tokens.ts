import type { SpineEventRef } from '../mind/mind.types';
import type { TokenBucket, ValenceBucket } from './local-identity.types';

export const TOP_N = 5;
export const PEAK_HOURS_COUNT = 3;
export const VOCABULARY_TOP_N = 10;
export const OPERATOR_FEEDBACK_REPETITION_THRESHOLD = 2;
export const OPERATOR_FEEDBACK_DECISION_SLOT_COUNT = 1;
export const OPERATOR_FEEDBACK_NEXT_STEP_PREFIX = 'learn_from_operator_feedback';

export const VOCABULARY_STOP_WORDS: ReadonlySet<string> = new Set([
  'o',
  'a',
  'os',
  'as',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'para',
  'com',
  'sem',
  'se',
  'que',
  'e',
  'ou',
  'um',
  'uma',
  'uns',
  'umas',
  'é',
  'foi',
  'não',
  'sim',
  'mais',
  'menos',
  'muito',
  'seu',
  'sua',
  'seus',
  'suas',
  'está',
  'estão',
  'você',
  'vocês',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'shall',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'all',
  'a' + 'ny',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'because',
  'about',
  'up',
  'out',
  'if',
  'then',
  'now',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'which',
  'who',
  'whom',
  'what',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
]);

export function parseTimestamp(iso: string): number {
  const d = new Date(iso);
  return d.getTime();
}

export function hourFromTimestamp(iso: string): number {
  return new Date(iso).getUTCHours();
}

export function toneFromValenceMix(buckets: readonly ValenceBucket[]): string {
  if (buckets.length === 0) {
    return 'neutral';
  }

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) {
    return 'neutral';
  }

  const posBucket = buckets.find((b) => b.valence === 'positive');
  const negBucket = buckets.find((b) => b.valence === 'negative');
  const positive = (posBucket !== undefined ? posBucket.count : 0) / total;
  const negative = (negBucket !== undefined ? negBucket.count : 0) / total;

  if (positive >= 0.6) {
    return 'positive';
  }
  if (negative >= 0.6) {
    return 'negative';
  }
  if (positive >= 0.4 && negative < 0.3) {
    return 'mostly-positive';
  }
  if (negative >= 0.4 && positive < 0.3) {
    return 'mostly-negative';
  }
  return 'balanced';
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúüçñ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !VOCABULARY_STOP_WORDS.has(t));
}

export function extractMessageTokens(events: readonly SpineEventRef[]): TokenBucket[] {
  const tokenCounts = new Map<string, number>();

  for (const event of events) {
    const payload = event.payload;
    if (!payload) {
      continue;
    }

    const content =
      (payload as Record<string, unknown>)['body'] ??
      (payload as Record<string, unknown>)['text'] ??
      (payload as Record<string, unknown>)['content'] ??
      (payload as Record<string, unknown>)['message'];

    if (typeof content === 'string') {
      for (const token of tokenize(content)) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }

    const messageRef = (payload as Record<string, unknown>)['messageRef'];
    if (typeof messageRef === 'string') {
      for (const token of tokenize(messageRef)) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }
  }

  return Array.from(tokenCounts.entries())
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, VOCABULARY_TOP_N);
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    const odd = sorted[mid];
    return odd !== undefined ? odd : 0;
  }
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left === undefined || right === undefined) {
    return 0;
  }
  return (left + right) / 2;
}
