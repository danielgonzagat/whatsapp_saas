const MAX_QUEUE_ID_LENGTH = 80;

function coerceToInputString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function isAllowedQueueIdChar(char: string): boolean {
  const code = char.charCodeAt(0);
  const isDigit = code >= 48 && code <= 57;
  const isUpper = code >= 65 && code <= 90;
  const isLower = code >= 97 && code <= 122;
  return isDigit || isUpper || isLower || char === '_' || char === '-';
}

type AccumulatorState = { normalized: string; previousWasSeparator: boolean };

function appendAllowedChar(state: AccumulatorState, char: string): void {
  state.normalized += char;
  state.previousWasSeparator = false;
}

function appendSeparator(state: AccumulatorState): void {
  if (state.previousWasSeparator || state.normalized.length === 0) return;
  state.normalized += '_';
  state.previousWasSeparator = true;
}

function accumulateNormalizedChars(input: string): string {
  const state: AccumulatorState = { normalized: '', previousWasSeparator: false };
  for (const char of input) {
    if (isAllowedQueueIdChar(char)) {
      appendAllowedChar(state, char);
    } else {
      appendSeparator(state);
    }
    if (state.normalized.length >= MAX_QUEUE_ID_LENGTH) break;
  }
  return state.normalized;
}

function stripLeadingTrailingUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '_') start += 1;
  while (end > start && value[end - 1] === '_') end -= 1;
  return value.slice(start, end);
}

function sanitizeQueueIdPart(value: unknown): string {
  const input = coerceToInputString(value);
  const normalized = accumulateNormalizedChars(input);
  const trimmed = stripLeadingTrailingUnderscores(normalized);
  return trimmed || 'na';
}

export function buildQueueJobId(prefix: string, ...parts: unknown[]): string {
  return [sanitizeQueueIdPart(prefix), ...parts.map(sanitizeQueueIdPart)].join('__');
}

export function buildQueueDedupId(prefix: string, ...parts: unknown[]): string {
  return buildQueueJobId(prefix, ...parts);
}
