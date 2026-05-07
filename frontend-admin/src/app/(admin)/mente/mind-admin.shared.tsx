import { AlertTriangle, Brain, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const TABS = [
  { key: 'state', label: 'Estado da Mente', icon: <Brain size={15} /> },
  { key: 'surprise', label: 'Surpresa Recente', icon: <AlertTriangle size={15} /> },
  { key: 'lift', label: 'Lift por Decisão', icon: <TrendingUp size={15} /> },
];

export const DECISION_TYPE_OPTIONS = [
  { value: 'cia_aggressiveness', label: 'CIA Aggressiveness' },
  { value: 'followup_timing', label: 'Follow-up Timing' },
  { value: 'send_window', label: 'Send Window' },
  { value: 'offer_discount', label: 'Offer Discount' },
];

export const SINCE_DAYS_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 14, label: '14 dias' },
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
];

export const SURPRISE_LIMIT_OPTIONS = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
];

export function severityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return <Badge variant="danger">Crítico</Badge>;
    case 'high':
      return <Badge variant="warning">Alto</Badge>;
    case 'moderate':
      return <Badge variant="outline">Moderado</Badge>;
    default:
      return <Badge variant="default">Baixo</Badge>;
  }
}

export function formatSurprise(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(3);
}

export function formatMean(value: number): string {
  return value.toFixed(4);
}

export function liftTone(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-rose-400';
  return 'text-[var(--app-text-secondary)]';
}

export function formatHorizon(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${Math.round(seconds / 3600)}h`;
}
