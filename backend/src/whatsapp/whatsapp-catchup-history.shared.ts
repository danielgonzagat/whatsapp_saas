const CONTACT_NAME_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;

export { safeStr } from '../common/string';

export { readText as normalizeOptionalText } from '../common/utils';

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
