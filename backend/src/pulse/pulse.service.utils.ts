import type { PulseOrganismStatus } from './pulse.service.contract';

const S_RE = /\s+/g;

export function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
export function compactText(value: string, max = 600) {
  const compact = value.replace(S_RE, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}
export function toOrganismStatus(input: string): Exclude<PulseOrganismStatus, 'STALE'> {
  if (input === 'UP' || input === 'DEGRADED' || input === 'DOWN') {
    return input;
  }
  return 'DEGRADED';
}
/** Pulse service. */
