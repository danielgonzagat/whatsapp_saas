import {
  normalizeContactEntry,
  normalizeChatEntry,
  normalizeMessageEntry,
} from './whatsapp-service.normalizers';
import type {
  NormalizedContact,
  NormalizedChat,
  ProviderMessageEnvelope,
} from './whatsapp-service.types';

function unwrapProviderArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const r = raw as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== 'object') return [];
  for (const key of ['contacts', 'chats', 'messages', 'items', 'data']) {
    const v = r[key];
    if (Array.isArray(v)) return v as unknown[];
  }
  return [];
}

export function normalizeContactsArray(
  raw: unknown,
  deps: {
    isPlaceholderContactName: (v: unknown, p?: string | null) => boolean;
    resolveTrustedContactName: (phone: string, ...candidates: unknown[]) => string;
    extractPhone: (id: string) => string;
  },
): NormalizedContact[] {
  return unwrapProviderArray(raw)
    .map((c) =>
      normalizeContactEntry(c, {
        isPlaceholder: deps.isPlaceholderContactName,
        resolveName: deps.resolveTrustedContactName,
        extractPhone: deps.extractPhone,
      }),
    )
    .filter((c): c is NormalizedContact => c !== null);
}

export function normalizeChatsArray(
  raw: unknown,
  deps: {
    resolveTrustedContactName: (phone: string, ...candidates: unknown[]) => string;
    extractPhone: (id: string) => string;
    isPlaceholderContactName: (v: unknown, p?: string | null) => boolean;
  },
): NormalizedChat[] {
  return unwrapProviderArray(raw)
    .map((c) =>
      normalizeChatEntry(c, {
        resolveName: deps.resolveTrustedContactName,
        extractPhone: deps.extractPhone,
        isPlaceholder: deps.isPlaceholderContactName,
      }),
    )
    .filter((c): c is NormalizedChat => c !== null);
}

export function normalizeMessagesArray(
  raw: unknown,
  fallbackChatId: string,
  deps: { extractPhone: (id: string) => string },
): ProviderMessageEnvelope[] {
  return unwrapProviderArray(raw)
    .map((m) =>
      normalizeMessageEntry(m, fallbackChatId, {
        extractPhone: deps.extractPhone,
      }),
    )
    .filter((m): m is ProviderMessageEnvelope => m !== null);
}
