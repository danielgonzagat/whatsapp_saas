// PULSE — Adapter Status Enumeration (Phase 4)
// Standardized status values for all external adapters

/** Adapter operational status type. */
export type AdapterStatus =
  | 'ready'
  | 'not_available'
  | 'stale'
  | 'invalid'
  | 'optional_not_configured';

/** All valid adapter status values as a readonly array. */
export const ADAPTER_STATUSES = [
  'ready',
  'not_available',
  'stale',
  'invalid',
  'optional_not_configured',
] as const satisfies readonly AdapterStatus[];

/**
 * Type guard to check if a value is a valid AdapterStatus.
 * @param value The value to check
 * @returns true if value is a valid AdapterStatus, false otherwise
 */
export function isAdapterStatus(value: unknown): value is AdapterStatus {
  return typeof value === 'string' && ADAPTER_STATUSES.includes(value as AdapterStatus);
}
