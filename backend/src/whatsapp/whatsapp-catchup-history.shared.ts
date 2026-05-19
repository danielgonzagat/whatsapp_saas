const CONTACT_NAME_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;

export function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

export function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

export function isDoePlaceholderName(value: string): boolean {
  return CONTACT_NAME_DOE_RE.test(value);
}

export type BackfillCursorData = {
  chatId?: string;
  activityTimestamp?: number;
  timestamp?: number;
  updatedAt?: unknown;
  [key: string]: unknown;
};

export type WahaMessagePayload = {
  _data?: { key?: { remoteJidAlt?: string; remoteJid?: string }; [key: string]: unknown };
  key?: { remoteJidAlt?: string; remoteJid?: string };
  [key: string]: unknown;
};

export type NormalizedJsonObj = Record<string, unknown>;
