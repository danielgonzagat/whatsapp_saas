const PATTERN_RE = /&/g;
const PATTERN_RE_2 = /</g;
const PATTERN_RE_3 = />/g;
const PATTERN_RE_4 = /"/g;
const PATTERN_RE_5 = /'/g;
const MARK_RE = /<mark>/g;
const MARK_RE_2 = /<\/mark>/g;
const KLOEL_MARK_OPEN_RE = /__KLOEL_MARK_OPEN__/g;
const KLOEL_MARK_CLOSE_RE = /__KLOEL_MARK_CLOSE__/g;
const PATTERN_RE_6 = /[.*+?^${}()|[\]\\]/g;
const S_RE = /\s+/;
const S_DE_S_RE = /\s+de\s+/i;
/** Conversation search result shape. */
export interface ConversationSearchResult {
  id: string;
  title: string;
  updatedAt?: string;
  matchedContent?: string;
  previewHtml?: string;
  tags?: string[];
}

/** Conversation search group shape. */
export interface ConversationSearchGroup {
  label: string;
  items: ConversationSearchResult[];
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(PATTERN_RE, '&amp;')
    .replace(PATTERN_RE_2, '&lt;')
    .replace(PATTERN_RE_3, '&gt;')
    .replace(PATTERN_RE_4, '&quot;')
    .replace(PATTERN_RE_5, '&#39;');
}

/** Sanitize marked html. */
export function sanitizeMarkedHtml(value: string): string {
  const placeholders = String(value || '')
    .replace(MARK_RE, '__KLOEL_MARK_OPEN__')
    .replace(MARK_RE_2, '__KLOEL_MARK_CLOSE__');

  return escapeHtml(placeholders)
    .replace(KLOEL_MARK_OPEN_RE, '<mark>')
    .replace(KLOEL_MARK_CLOSE_RE, '</mark>');
}

/** Highlight plain text. */
export function highlightPlainText(value: string, query: string): string {
  const text = String(value || '').trim();
  const tokens = String(query || '')
    .trim()
    .split(S_RE)
    .map((token) => token.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (!text || tokens.length === 0) {
    return escapeHtml(text);
  }

  const escapedQuery = tokens.map((token) => token.replace(PATTERN_RE_6, '\\$&'));
  const regex = new RegExp(`(${escapedQuery.join('|')})`, 'gi');
  const placeholders = text.replace(regex, '__KLOEL_MARK_OPEN__$1__KLOEL_MARK_CLOSE__');

  return sanitizeMarkedHtml(placeholders);
}

/** Format conversation search date label. */
export function formatConversationSearchDateLabel(value?: string | Date, now = new Date()): string {
  const date = value ? new Date(value) : new Date(0);
  if (Number.isNaN(date.getTime())) {
    return 'Sem data';
  }

  const localNow = new Date(now);
  const todayStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetStart.getTime() === todayStart.getTime()) {
    return 'Hoje';
  }

  if (targetStart.getTime() === yesterdayStart.getTime()) {
    return 'Ontem';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
  })
    .format(date)
    .replace(S_DE_S_RE, ' ')
    .replace('.', '');
}

/** Format conversation search time. */
export function formatConversationSearchTime(value?: string | Date): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Group conversation search results. */
export function groupConversationSearchResults(
  items: ConversationSearchResult[],
  now = new Date(),
): ConversationSearchGroup[] {
  const groups = new Map<string, ConversationSearchResult[]>();

  for (const item of items) {
    const label = formatConversationSearchDateLabel(item.updatedAt, now);
    const current = groups.get(label) || [];
    current.push(item);
    groups.set(label, current);
  }

  return [...groups.entries()].map(([label, groupedItems]) => ({
    label,
    items: groupedItems,
  }));
}
