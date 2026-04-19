import type { CSSProperties } from 'react';

export const INBOX_DIGIT_RE = /\D/g;

export type ChannelFilter = 'all' | 'whatsapp' | 'email' | 'instagram';
export type StatusFilter = 'open' | 'closed' | 'all';

export function extractErrorMessage(err: unknown, fallback: string) {
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function formatInboxTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const INBOX_RESPONSIVE_VARS = {
  '--inbox-page-x': 'clamp(14px, 2vw, 24px)',
  '--inbox-page-y': 'clamp(20px, 2.8vw, 32px)',
  '--inbox-shell-gap': 'clamp(16px, 1.8vw, 24px)',
  '--inbox-radius': 'clamp(14px, 1.4vw, 18px)',
  '--inbox-panel-x': 'clamp(14px, 1.6vw, 20px)',
  '--inbox-panel-y': 'clamp(12px, 1.25vw, 18px)',
  '--inbox-title': 'clamp(18px, 1.5vw, 24px)',
  '--inbox-section-title': 'clamp(13px, 0.95vw, 15px)',
  '--inbox-body': 'clamp(12px, 0.88vw, 14px)',
  '--inbox-body-sm': 'clamp(11px, 0.76vw, 12.5px)',
  '--inbox-body-xs': 'clamp(10px, 0.66vw, 11.5px)',
  '--inbox-chip-x': 'clamp(8px, 0.8vw, 10px)',
  '--inbox-chip-y': 'clamp(4px, 0.45vw, 6px)',
  '--inbox-button-x': 'clamp(12px, 1vw, 14px)',
  '--inbox-button-y': 'clamp(8px, 0.75vw, 10px)',
  '--inbox-input-x': 'clamp(14px, 1.1vw, 16px)',
  '--inbox-input-y': 'clamp(10px, 0.9vw, 12px)',
  '--inbox-item-gap': 'clamp(10px, 1vw, 14px)',
  '--inbox-message-x': 'clamp(12px, 1.15vw, 16px)',
  '--inbox-message-y': 'clamp(10px, 0.9vw, 12px)',
  '--inbox-icon-sm': 'clamp(14px, 0.95vw, 16px)',
  '--inbox-icon-md': 'clamp(16px, 1.1vw, 18px)',
} as CSSProperties;
