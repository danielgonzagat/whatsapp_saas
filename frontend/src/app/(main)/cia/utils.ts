'use client';

export const PATTERN_RE = /[_-]+/g;
export const S_RE = /\s+/g;
export const B_W_RE = /\b\w/g;
export const PATTERN_RE_2 = /_/g;

import { formatCurrency } from '@/lib/common/money';
export { formatCurrency };

export function formatPhaseLabel(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (raw === 'streaming_token') {
    return '';
  }

  return raw
    .replace(PATTERN_RE, ' ')
    .replace(S_RE, ' ')
    .trim()
    .replace(B_W_RE, (char) => char.toUpperCase());
}

export function formatTs(ts?: string | null) {
  if (!ts) {
    return '';
  }
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function workItemStateBadgeVariant(
  state: string,
): 'success' | 'warning' | 'error' | 'info' | undefined {
  switch (state) {
    case 'COMPLETED':
      return 'success';
    case 'WAITING_APPROVAL':
    case 'WAITING_INPUT':
      return 'warning';
    case 'BLOCKED':
      return 'error';
    default:
      return 'info';
  }
}
