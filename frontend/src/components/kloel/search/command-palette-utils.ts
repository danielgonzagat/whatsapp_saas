import type { KloelGlobalSearchResult } from '@/lib/api/kloel-search';
import type { ThreadSearchPayload } from '@/lib/kloel-conversations';
import type { ConversationSearchResult } from './conversation-search-utils';

const S_RE = /\s+/g;

/** Build recent preview. */
export function buildRecentPreview(input?: string): string {
  const text = String(input || '')
    .replace(S_RE, ' ')
    .trim();
  return text || 'Abra a conversa para retomar o contexto.';
}

function joinPreviewParts(parts: Array<string | undefined>): string {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' - ');
}

/** Map recent conversation. */
export function mapRecentConversation(conversation: {
  id: string;
  title: string;
  updatedAt?: string | undefined;
  lastMessagePreview?: string | undefined;
}): ConversationSearchResult {
  return {
    id: conversation.id,
    type: 'conversation',
    title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
    updatedAt: conversation.updatedAt,
    matchedContent: buildRecentPreview(conversation.lastMessagePreview),
    previewHtml: buildRecentPreview(conversation.lastMessagePreview),
    tags: [],
    href: `/chat?conversationId=${encodeURIComponent(conversation.id)}`,
  };
}

/** Map search payload. */
export function mapSearchPayload(payload: ThreadSearchPayload): ConversationSearchResult {
  return {
    id: payload.id,
    type: 'conversation',
    title: String(payload.title || 'Nova conversa').trim() || 'Nova conversa',
    updatedAt: payload.updatedAt,
    matchedContent: buildRecentPreview(payload.matchedContent),
    previewHtml: payload.previewHtml || payload.matchedContent || '',
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean).slice(0, 3) : [],
    href: `/chat?conversationId=${encodeURIComponent(payload.id)}`,
  };
}

/** Map global search payload. */
export function mapGlobalSearchPayload(payload: KloelGlobalSearchResult): ConversationSearchResult {
  const preview = joinPreviewParts([payload.subtitle, payload.preview]) || payload.title;
  return {
    id: payload.id,
    type: payload.type,
    title: String(payload.title || 'Resultado').trim() || 'Resultado',
    updatedAt: payload.updatedAt,
    matchedContent: buildRecentPreview(preview),
    previewHtml: buildRecentPreview(preview),
    tags: [payload.type].filter(Boolean).slice(0, 3),
    href: payload.href,
  };
}
