const ASCII_DIGIT_START = 48;
const ASCII_DIGIT_END = 57;
const ASCII_UPPER_START = 65;
const ASCII_UPPER_END = 90;
const ASCII_LOWER_START = 97;
const ASCII_LOWER_END = 122;

export function coerceToInputString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function isAsciiAlphanumericCode(code: number): boolean {
  if (code >= ASCII_DIGIT_START && code <= ASCII_DIGIT_END) return true;
  if (code >= ASCII_UPPER_START && code <= ASCII_UPPER_END) return true;
  return code >= ASCII_LOWER_START && code <= ASCII_LOWER_END;
}

const QUEUE_ID_SYMBOLS = new Set(['_', '-']);

export function isAllowedQueueIdChar(char: string): boolean {
  return isAsciiAlphanumericCode(char.charCodeAt(0)) || QUEUE_ID_SYMBOLS.has(char);
}

export function stripLeadingTrailingUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '_') start += 1;
  while (end > start && value[end - 1] === '_') end -= 1;
  return value.slice(start, end);
}
