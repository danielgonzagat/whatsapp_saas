import {
  coerceToInputString,
  isAllowedQueueIdChar,
  stripLeadingTrailingUnderscores,
} from './job-id-chars.util';

const MAX_QUEUE_ID_LENGTH = 80;

type AccumulatorState = { normalized: string; previousWasSeparator: boolean };

function appendAllowedChar(state: AccumulatorState, char: string): void {
  state.normalized += char;
  state.previousWasSeparator = false;
}

function appendSeparator(state: AccumulatorState): void {
  if (state.previousWasSeparator || state.normalized.length === 0) {
    return;
  }
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
    if (state.normalized.length >= MAX_QUEUE_ID_LENGTH) {
      break;
    }
  }
  return state.normalized;
}

function sanitizeQueueIdPart(value: unknown): string {
  const input = coerceToInputString(value);
  const normalized = accumulateNormalizedChars(input);
  const trimmed = stripLeadingTrailingUnderscores(normalized);
  return trimmed || 'na';
}

/** Build queue job id. */
export function buildQueueJobId(prefix: string, ...parts: unknown[]): string {
  return [sanitizeQueueIdPart(prefix), ...parts.map(sanitizeQueueIdPart)].join('__');
}

/** Build queue dedup id. */
export function buildQueueDedupId(prefix: string, ...parts: unknown[]): string {
  return buildQueueJobId(prefix, ...parts);
}
