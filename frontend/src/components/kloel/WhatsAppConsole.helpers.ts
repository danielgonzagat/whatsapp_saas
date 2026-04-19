// Pure data helpers extracted from WhatsAppConsole.tsx to reduce cyclomatic
// complexity. No React, no JSX — these are payload-shape transforms only.

import type { Message as InboxMessage } from '@/lib/api';

const D_RE = /^\d+$/;

export interface ChatPreview {
  id: string;
  title: string;
  subtitle?: string;
  lastMessageAt?: string;
}

export function parseDateLike(value?: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const normalized = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (D_RE.test(trimmed)) {
      return parseDateLike(Number(trimmed));
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate._seconds === 'number' && typeof candidate._nanoseconds === 'number') {
      return parseDateLike(candidate._seconds * 1000);
    }

    return parseDateLike(
      candidate.createdAt ||
        candidate.timestamp ||
        candidate.ts ||
        candidate.lastMessageAt ||
        candidate.updatedAt ||
        candidate.last_time,
    );
  }

  return null;
}

export function toIsoDateLike(value?: unknown): string | undefined {
  return parseDateLike(value)?.toISOString();
}

export function extractPreviewText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractPreviewText(entry))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    return (
      extractPreviewText(candidate.text) ||
      extractPreviewText(candidate.body) ||
      extractPreviewText(candidate.content) ||
      extractPreviewText(candidate.caption) ||
      extractPreviewText(candidate.message) ||
      extractPreviewText(candidate.lastMessage) ||
      extractPreviewText(candidate.lastMessagePreview) ||
      extractPreviewText((candidate._data as Record<string, unknown>)?.body) ||
      ''
    ).trim();
  }
  return '';
}

export function formatClock(value?: string | number | Date | null) {
  if (!value) return '';
  const date = parseDateLike(value);
  if (!date) return '';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizeChats(payload: unknown): ChatPreview[] {
  const p = payload as Record<string, unknown> | unknown[];
  const rows = Array.isArray(p)
    ? p
    : Array.isArray((p as Record<string, unknown>)?.chats)
      ? ((p as Record<string, unknown>).chats as unknown[])
      : [];

  return (rows as Record<string, unknown>[])
    .map((chat: Record<string, unknown>) => ({
      id: String(chat?.id || chat?.chatId || chat?.contactId || ''),
      title:
        String(
          (chat?.contact as Record<string, unknown>)?.name ||
            (chat?.contact as Record<string, unknown>)?.pushName ||
            chat?.name ||
            chat?.contactName ||
            chat?.phone ||
            (chat?.contact as Record<string, unknown>)?.phone ||
            'Contato',
        ) || 'Contato',
      subtitle: extractPreviewText(
        chat?.lastMessagePreview ||
          chat?.lastMessage ||
          chat?.lastMessageText ||
          (chat?._data as Record<string, unknown>)?.body,
      ),
      lastMessageAt: toIsoDateLike(
        chat?.lastMessageAt || chat?.updatedAt || chat?.ts || chat?.timestamp || chat?.lastMessage,
      ),
    }))
    .filter((chat: ChatPreview) => chat.id)
    .sort((left: ChatPreview, right: ChatPreview) => {
      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
      return rightTime - leftTime;
    });
}

export function normalizeMessages(payload: unknown): InboxMessage[] {
  const p = payload as Record<string, unknown> | unknown[];
  const rows = Array.isArray(p)
    ? p
    : Array.isArray((p as Record<string, unknown>)?.messages)
      ? ((p as Record<string, unknown>).messages as unknown[])
      : [];

  const normalizedRows: Array<{ directionValue: string; raw: Record<string, unknown> }> = (
    rows as Record<string, unknown>[]
  ).map((message: Record<string, unknown>) => ({
    directionValue: String(
      message?.direction || (message?.fromMe ? 'OUTBOUND' : 'INBOUND'),
    ).toUpperCase(),
    raw: message,
  }));

  const result: InboxMessage[] = normalizedRows
    .map(
      ({
        directionValue,
        raw,
      }: {
        directionValue: string;
        raw: Record<string, unknown>;
      }): InboxMessage => ({
        id: String(raw?.id || raw?.messageId || `${raw?.createdAt || Date.now()}`),
        content: extractPreviewText(
          raw?.content ||
            raw?.text ||
            raw?.body ||
            raw?.caption ||
            raw?.message ||
            (raw?._data as Record<string, unknown>)?.body,
        ),
        direction: directionValue === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
        type: (raw?.type as string) || 'text',
        status: raw?.status as string | undefined,
        mediaUrl: (raw?.mediaUrl as string | null) || null,
        createdAt:
          toIsoDateLike(raw?.createdAt || raw?.timestamp || raw?.ts) || new Date().toISOString(),
      }),
    )
    .filter((message) => Boolean(message.id));

  return result;
}
