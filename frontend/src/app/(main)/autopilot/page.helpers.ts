// Pure helpers extracted from autopilot/page.tsx to reduce the host
// component's cyclomatic complexity. All transforms are byte-identical to the
// original inline implementation.

import type { AutopilotSmokeTestResult } from './page.ui';

export function unwrapSettled<T>(
  result: PromiseSettledResult<unknown>,
  transform: (value: unknown) => T,
  fallback: T,
): T {
  return result.status === 'fulfilled' ? transform(result.value) : fallback;
}

/** Unwrap data envelope. */
export function unwrapDataEnvelope<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') {
    return (value ?? null) as T | null;
  }
  const inner = (value as { data?: T }).data;
  return (inner !== undefined ? inner : (value as T)) ?? null;
}

/** Translate AskInsightsResult without answer into a Portuguese fallback summary. */
export function askResultToSummary(result: Record<string, unknown>): string {
  const keys = Object.keys(result).filter((k) => k !== 'question');
  if (keys.length === 0) {
    return 'Nenhum dado disponível na resposta.';
  }
  return `Resposta recebida com ${keys.length} campo${keys.length === 1 ? '' : 's'}.`;
}

/** Unwrap array envelope. */
export function unwrapArrayEnvelope<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  const inner = (value as { data?: T[] } | null | undefined)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

function readQueue(source: Record<string, unknown>): AutopilotSmokeTestResult['queue'] | undefined {
  const value = source.queue;
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const queue = value as Record<string, unknown>;
  return {
    waiting: readNumber(queue, 'waiting'),
    active: readNumber(queue, 'active'),
    delayed: readNumber(queue, 'delayed'),
    failed: readNumber(queue, 'failed'),
  };
}

/** Normalize the backend smoke test envelope without exposing raw JSON in the UI. */
export function readSmokeResult(raw: Record<string, unknown>): AutopilotSmokeTestResult {
  const resultValue = raw.result;
  const result =
    resultValue && typeof resultValue === 'object' ? (resultValue as Record<string, unknown>) : {};
  const mode = readString(raw, 'mode') === 'live' ? 'live' : 'dry-run';
  const resultMode = readString(result, 'mode');

  return {
    smokeTestId: readString(raw, 'smokeTestId') || readString(raw, 'id') || 'smoke-test',
    mode,
    phone: readString(raw, 'phone') || '',
    message: readString(raw, 'message') || '',
    result: {
      status: readString(result, 'status'),
      stage: readString(result, 'stage'),
      error: readString(result, 'error'),
      previewText: readString(result, 'previewText'),
      mode: resultMode === 'live' ? 'live' : resultMode === 'dry-run' ? 'dry-run' : undefined,
      reason: readString(result, 'reason'),
    },
    queue: readQueue(raw),
  };
}
