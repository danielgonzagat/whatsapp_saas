const S_RE = /\s+/;
const S_DE_S_RE = /\s+de\s+/i;
export interface ConversationSearchResult {
  id: string;
  title: string;
  updatedAt?: string;
  matchedContent?: string;
  previewHtml?: string;
  tags?: string[];
}

export interface ConversationSearchGroup {
  label: string;
  items: ConversationSearchResult[];
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeMarkedHtml(value: string): string {
  const placeholders = String(value || '')
    .replace(/<mark>/g, '__KLOEL_MARK_OPEN__')
    .replace(/<\/mark>/g, '__KLOEL_MARK_CLOSE__');

  return escapeHtml(placeholders)
    .replace(/__KLOEL_MARK_OPEN__/g, '<mark>')
    .replace(/__KLOEL_MARK_CLOSE__/g, '</mark>');
}

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

  const escapedQuery = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedQuery.join('|')})`, 'gi');
  const placeholders = text.replace(regex, '__KLOEL_MARK_OPEN__$1__KLOEL_MARK_CLOSE__');

  return sanitizeMarkedHtml(placeholders);
}

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
