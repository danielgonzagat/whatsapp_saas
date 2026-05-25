import type { Prisma } from '@prisma/client';

import { INVISIBLE_CHARS_RE, SECRET_MARKER_RE, PROMPT_INJECTION_RE } from '../../common/regex';

export function sanitizeAgentRuntimeText(input: unknown, maxLength = 4000): string {
  const raw =
    typeof input === 'string'
      ? input
      : typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint'
        ? String(input)
        : input === null || typeof input === 'undefined'
          ? ''
          : JSON.stringify(input);
  return raw.replace(INVISIBLE_CHARS_RE, '').slice(0, maxLength);
}

export function classifyMemorySafety(content: string): {
  safe: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (PROMPT_INJECTION_RE.test(content)) {
    reasons.push('prompt_injection_pattern');
  }
  if (SECRET_MARKER_RE.test(content)) {
    reasons.push('secret_like_content');
  }
  return { safe: reasons.length === 0, reasons };
}

export function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || typeof value === 'undefined') {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toInputJsonValue(item));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => typeof entry !== 'undefined')
        .map(([key, entry]) => [key, toInputJsonValue(entry)]),
    ) as Prisma.InputJsonObject;
  }
  return String(value);
}
