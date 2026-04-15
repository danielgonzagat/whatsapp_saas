import { randomUUID } from 'node:crypto';

/**
 * Returns standard tracing headers (X-Request-ID) to propagate
 * correlation IDs through outbound HTTP calls.
 *
 * If a requestId is already known (e.g. from the incoming request),
 * pass it to preserve the full trace chain. Otherwise a new UUID
 * is generated to ensure every outbound call is traceable.
 */
export function getTraceHeaders(requestId?: string): Record<string, string> {
  return {
    'X-Request-ID': requestId || randomUUID(),
  };
}
