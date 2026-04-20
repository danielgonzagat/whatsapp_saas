// Pure data helpers extracted from WhatsAppConsole.tsx to reduce cyclomatic
// complexity. No React, no JSX — these are payload-shape transforms only.

import type { Message as InboxMessage } from '@/lib/api';

const D_RE = /^\d+$/;

/** Chat preview shape. */
export interface ChatPreview {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Subtitle property. */
  subtitle?: string;
  /** Last message at property. */
  lastMessageAt?: string;
}

const DATE_CANDIDATE_FIELDS = [
  'createdAt',
  'timestamp',
  'ts',
  'lastMessageAt',
  'updatedAt',
  'last_time',
] as const;

function parseDateFromNumber(value: number): Date | null {
  const normalized = value > 1_000_000_000_000 ? value : value * 1000;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateFromString(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (D_RE.test(trimmed)) {
    return parseDateLike(Number(trimmed));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickFirstDateCandidate(candidate: Record<string, unknown>): unknown {
  for (const field of DATE_CANDIDATE_FIELDS) {
    const raw = candidate[field];
    if (raw) {
      return raw;
    }
  }
  return undefined;
}

function parseDateFromObject(candidate: Record<string, unknown>): Date | null {
  if (typeof candidate._seconds === 'number' && typeof candidate._nanoseconds === 'number') {
    return parseDateLike(candidate._seconds * 1000);
  }
  return parseDateLike(pickFirstDateCandidate(candidate));
}

/** Parse date like. */
export function parseDateLike(value?: unknown): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    return parseDateFromNumber(value);
  }
  if (typeof value === 'string') {
    return parseDateFromString(value);
  }
  if (typeof value === 'object') {
    return parseDateFromObject(value as Record<string, unknown>);
  }
  return null;
}

/** To iso date like. */
export function toIsoDateLike(value?: unknown): string | undefined {
  return parseDateLike(value)?.toISOString();
}

const PREVIEW_TEXT_FIELDS = [
  'text',
  'body',
  'content',
  'caption',
  'message',
  'lastMessage',
  'lastMessagePreview',
] as const;

function extractPreviewFromArray(value: unknown[]): string {
  return value
    .map((entry) => extractPreviewText(entry))
    .filter(Boolean)
    .join(' ')
    .trim();
}

function extractPreviewFromObject(candidate: Record<string, unknown>): string {
  for (const field of PREVIEW_TEXT_FIELDS) {
    const extracted = extractPreviewText(candidate[field]);
    if (extracted) {
      return extracted;
    }
  }
  const nestedBody = (candidate._data as Record<string, unknown>)?.body;
  return extractPreviewText(nestedBody).trim();
}

/** Extract preview text. */
export function extractPreviewText(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return extractPreviewFromArray(value);
  }
  if (typeof value === 'object') {
    return extractPreviewFromObject(value as Record<string, unknown>);
  }
  return '';
}

/** Format clock. */
export function formatClock(value?: string | number | Date | null) {
  if (!value) {
    return '';
  }
  const date = parseDateLike(value);
  if (!date) {
    return '';
  }
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractChatRows(payload: unknown): Record<string, unknown>[] {
  const p = payload as Record<string, unknown> | unknown[];
  if (Array.isArray(p)) {
    return p as Record<string, unknown>[];
  }
  const inner = (p as Record<string, unknown>)?.chats;
  return (Array.isArray(inner) ? inner : []) as Record<string, unknown>[];
}

function extractChatTitle(chat: Record<string, unknown>): string {
  const contact = chat?.contact as Record<string, unknown> | undefined;
  const candidate =
    contact?.name ||
    contact?.pushName ||
    chat?.name ||
    chat?.contactName ||
    chat?.phone ||
    contact?.phone ||
    'Contato';
  return String(candidate) || 'Contato';
}

function extractChatSubtitle(chat: Record<string, unknown>): string {
  const inner = chat?._data as Record<string, unknown> | undefined;
  return extractPreviewText(
    chat?.lastMessagePreview || chat?.lastMessage || chat?.lastMessageText || inner?.body,
  );
}

function extractChatLastMessageAt(chat: Record<string, unknown>): string | undefined {
  return (
    toIsoDateLike(
      chat?.lastMessageAt || chat?.updatedAt || chat?.ts || chat?.timestamp || chat?.lastMessage,
    ) ?? undefined
  );
}

function compareChatsByLastMessage(left: ChatPreview, right: ChatPreview): number {
  const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
  const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
  return rightTime - leftTime;
}

/** Normalize chats. */
export function normalizeChats(payload: unknown): ChatPreview[] {
  return extractChatRows(payload)
    .map((chat) => ({
      id: String(chat?.id || chat?.chatId || chat?.contactId || ''),
      title: extractChatTitle(chat),
      subtitle: extractChatSubtitle(chat),
      lastMessageAt: extractChatLastMessageAt(chat),
    }))
    .filter((chat: ChatPreview) => chat.id)
    .sort(compareChatsByLastMessage);
}

/** Normalize messages. */
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
