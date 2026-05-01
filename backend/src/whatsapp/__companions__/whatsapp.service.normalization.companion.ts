const D_RE = /\D/g;

export function normalizeNumber(num: string): string {
  return num.replace(D_RE, '');
}

export function readText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

export function isIndividualChatId(chatId?: string | null) {
  const value = String(chatId || '').trim();
  return value.endsWith('@c.us') || value.endsWith('@s.whatsapp.net');
}

export function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function resolveTimestamp(value: unknown): number {
  const v = value as Record<string, unknown> | undefined;
  const vChat = v?._chat as Record<string, unknown> | undefined;
  const vLastMessage = v?.lastMessage as Record<string, unknown> | undefined;
  const vLastMessageData = vLastMessage?._data as Record<string, unknown> | undefined;
  const candidates = [
    vChat?.conversationTimestamp,
    vChat?.lastMessageRecvTimestamp,
    v?.conversationTimestamp,
    v?.lastMessageRecvTimestamp,
    vLastMessage?.timestamp,
    vLastMessageData?.messageTimestamp,
    v?.timestamp,
    v?.t,
    v?.createdAt,
    v?.lastMessageTimestamp,
    v?.last_time,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate > 1e12 ? candidate : candidate * 1000;
    }
    if (typeof candidate === 'string') {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 1e12 ? numeric : numeric * 1000;
      }
      const date = new Date(candidate);
      if (!Number.isNaN(date.getTime())) {
        return date.getTime();
      }
    }
  }

  return 0;
}

export function toIsoTimestamp(timestamp: number) {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

export function normalizeDateValue(resolveTs: (v: unknown) => number, value: unknown) {
  const timestamp = resolveTs({ createdAt: value });
  return toIsoTimestamp(timestamp);
}

export function normalizeProbabilityScore(score: unknown, bucket?: string | null) {
  const numeric = Number(score);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
  }

  switch (
    String(bucket || '')
      .trim()
      .toUpperCase()
  ) {
    case 'VERY_HIGH':
      return 0.95;
    case 'HIGH':
      return 0.8;
    case 'MEDIUM':
      return 0.5;
    case 'LOW':
      return 0.15;
    default:
      return 0;
  }
}

export function normalizeChatId(chatId: string) {
  if (String(chatId || '').includes('@')) {
    return chatId;
  }
  return `${normalizeNumber(chatId)}@c.us`;
}

export function normalizeHash(text: string) {
  return Buffer.from(text || '')
    .toString('base64')
    .slice(0, 32);
}
