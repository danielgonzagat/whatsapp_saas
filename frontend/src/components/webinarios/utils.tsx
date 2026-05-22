import { CheckCircle, Clock, Play } from 'lucide-react';

import { colors } from '@/lib/design-tokens';
import { toSupportedEmbedUrl } from '@/lib/video-embed';

export function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '\u2014';
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusLabel(status: string) {
  switch (status) {
    case 'LIVE':
      return 'Ao Vivo';
    case 'COMPLETED':
      return 'Concluido';
    default:
      return 'Agendado';
  }
}

export function statusColor(status: string) {
  switch (status) {
    case 'LIVE':
      return colors.ember.primary;
    case 'COMPLETED':
      return colors.text.muted;
    default:
      return colors.semantic.success;
  }
}

export function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'LIVE':
      return <Play size={12} aria-hidden="true" />;
    case 'COMPLETED':
      return <CheckCircle size={12} aria-hidden="true" />;
    default:
      return <Clock size={12} aria-hidden="true" />;
  }
}

export function toEmbedUrl(url: string): string | null {
  return toSupportedEmbedUrl(url);
}
