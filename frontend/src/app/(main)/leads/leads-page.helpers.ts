import type { Lead } from '@/lib/api';

export const LEADS_DIGIT_RE = /\D/g;

export const LEAD_STATUS_LABEL: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  new: 'Novo',
  cold: 'Frio',
  converted: 'Convertido',
};

export function safeLeadDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function formatLeadTimeAgo(date: Date | null): string {
  if (!date) {
    return '—';
  }
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return 'agora';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function leadTitle(lead: Lead): string {
  return lead.name || lead.phone || 'Lead';
}
