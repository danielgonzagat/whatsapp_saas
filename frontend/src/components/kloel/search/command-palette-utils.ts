import type { ThreadSearchPayload } from '@/lib/kloel-conversations';
import type { ConversationSearchResult } from './conversation-search-utils';

const S_RE = /\s+/g;

export function buildRecentPreview(input?: string): string {
  const text = String(input || '')
    .replace(S_RE, ' ')
    .trim();
  return text || 'Abra a conversa para retomar o contexto.';
}

export function mapRecentConversation(conversation: {
  id: string;
  title: string;
  updatedAt?: string;
  lastMessagePreview?: string;
}): ConversationSearchResult {
  return {
    id: conversation.id,
    title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
    updatedAt: conversation.updatedAt,
    matchedContent: buildRecentPreview(conversation.lastMessagePreview),
    previewHtml: buildRecentPreview(conversation.lastMessagePreview),
    tags: [],
  };
}

export function mapSearchPayload(payload: ThreadSearchPayload): ConversationSearchResult {
  return {
    id: payload.id,
    title: String(payload.title || 'Nova conversa').trim() || 'Nova conversa',
    updatedAt: payload.updatedAt,
    matchedContent: buildRecentPreview(payload.matchedContent),
    previewHtml: payload.previewHtml || payload.matchedContent || '',
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean).slice(0, 3) : [],
  };
}
