import { type KloelStreamErrorEvent } from './kloel-stream-events';

/**
 * Pure helpers extracted from `kloel-conversations.ts` (Wave 117 / Claude-LLL).
 *
 * Visual contract: none — this module is pure data-shape utilities. No DOM,
 * no SWR, no token storage, no network. Safe to test in isolation under
 * vitest.
 */

type JsonRecord = Record<string, unknown>;

/** Narrow `unknown` to a plain JSON-style record (non-null object, not array). */
export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalise any thrown value into a human-readable string, falling back to a
 * caller-supplied default when the error carries no usable message.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

/**
 * Unwrap a response envelope of the shape `{ data: T }`. When the payload is
 * not wrapped, the payload itself is returned unchanged.
 */
export function extractWrappedPayload<T>(payload: unknown): T {
  if (isRecord(payload) && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

/**
 * Build the `Error` object for a Kloel stream `error` event, attaching the
 * upstream code on the `.code` field for downstream handlers.
 */
export function createKloelStreamError(event: KloelStreamErrorEvent): Error & { code?: string } {
  const error = new Error(event.content || event.error || 'stream_failed') as Error & {
    code?: string;
  };
  error.code = event.error || 'stream_failed';
  return error;
}

/**
 * Translate a stream `AbortSignal.reason` to either a user-facing message or
 * `null` when the abort is silent (`cancelled_by_client`). The string contract
 * mirrors the previously inlined branches inside `streamAuthenticatedKloelMessage`.
 */
export function describeStreamAbortReason(reason: unknown): string | null {
  const abortReason = typeof reason === 'string' ? reason : 'stream_aborted';

  if (abortReason === 'cancelled_by_client') {
    return null;
  }

  if (abortReason === 'stream_idle_timeout') {
    return 'A resposta ficou inativa por muito tempo. Sua mensagem foi preservada. Tente novamente.';
  }

  return abortReason;
}

/** Standard user-facing message when the SSE stream ends without a terminal event. */
export const STREAM_INTERRUPTED_MESSAGE =
  'A resposta foi interrompida antes da conclusão. Sua mensagem foi preservada. Tente novamente.';

/**
 * Pull complete lines out of an SSE accumulation buffer. Returns the new
 * buffer (any trailing partial line) and the lines ready for processing.
 *
 * Exported separately so the stream consumer can be unit-tested without
 * needing a real `ReadableStream`.
 */
export function consumeSseBuffer(buffer: string): { remainder: string; lines: string[] } {
  const lines = buffer.split('\n');
  const remainder = lines.pop() ?? '';
  return { remainder, lines };
}

/**
 * Validate the SSE `data: ...` prefix and return the JSON payload, or `null`
 * when the line is a heartbeat / sentinel / non-data frame.
 */
export function extractSseDataPayload(line: string): string | null {
  if (!line.startsWith('data: ')) {
    return null;
  }
  const raw = line.slice(6);
  if (!raw || raw === '[DONE]') {
    return null;
  }
  return raw;
}

/**
 * Clamp the thread-search `limit` query parameter to the supported window
 * (1..20). Mirrors the previously inlined `Math.min(Math.max(limit, 1), 20)`.
 */
export function clampThreadSearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 20);
}

/** Normalise the thread-search query and decide whether it is searchable. */
export function normalizeThreadSearchQuery(query: unknown): string | null {
  const normalized = String(query ?? '').trim();
  if (normalized.length < 2) {
    return null;
  }
  return normalized;
}
