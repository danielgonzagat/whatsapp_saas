import type { CiaSurfaceResponse } from '@/lib/api';

const PATTERN_RE = /[_-]+/g;
const S_RE = /\s+/g;
const B_W_RE = /\b\w/g;
const PATTERN_RE_2 = /_/g;

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

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

export { PATTERN_RE_2 };

const ACTIVE_CIA_MODES = new Set(['LIVE', 'BACKLOG', 'FULL']);

interface CiaStreamEventLike {
  type: string;
  message: string;
  phase?: string | null;
  ts?: string;
  meta?: Record<string, unknown>;
}

export function isCiaActiveMode(mode: string): boolean {
  return ACTIVE_CIA_MODES.has(mode);
}

export function appendRecentEvent(
  current: CiaSurfaceResponse,
  event: CiaStreamEventLike,
): CiaSurfaceResponse {
  const recent = [...(current.recent || []), event].slice(-12);
  return {
    ...current,
    now: {
      message: event.message,
      phase: event.phase || null,
      type: event.type,
      ...(event.ts ? { ts: event.ts } : {}),
    },
    recent,
  };
}

export function guaranteeReportToSummary(value: Record<string, unknown>): string {
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return 'Relatório de garantia vazio.';
  }

  const parts: string[] = [];

  if (typeof value.status === 'string') {
    parts.push(`Status: ${value.status}`);
  }
  if (value.passed === true) {
    parts.push('Aprovada');
  }
  if (value.passed === false) {
    parts.push('Falhou');
  }

  if (typeof value.checks === 'number') {
    parts.push(`${value.checks} verificações`);
  } else if (Array.isArray(value.checks)) {
    parts.push(`${value.checks.length} verificações`);
  }

  const criticalFindings = value.criticalFindings;
  if (typeof criticalFindings === 'number' && criticalFindings > 0) {
    parts.push(`${criticalFindings} achados críticos`);
  } else if (Array.isArray(criticalFindings) && criticalFindings.length > 0) {
    parts.push(`${criticalFindings.length} achados críticos`);
  }

  if (typeof value.totalActions === 'number') {
    parts.push(`${value.totalActions} ações`);
  }

  if (typeof value.passedCount === 'number' && typeof value.totalCount === 'number') {
    parts.push(`${value.passedCount}/${value.totalCount} aprovados`);
  }

  if (typeof value.warnings === 'number' && value.warnings > 0) {
    parts.push(`${value.warnings} avisos`);
  } else if (Array.isArray(value.warnings) && value.warnings.length > 0) {
    parts.push(`${value.warnings.length} avisos`);
  }

  if (typeof value.cycleNumber === 'number') {
    parts.push(`Ciclo ${value.cycleNumber}`);
  }

  if (parts.length === 0) {
    const topKeys = keys.slice(0, 4).map((k) => {
      const v = value[k];
      if (typeof v === 'string') {
        return `${k}: ${v.length > 60 ? v.slice(0, 60) + '…' : v}`;
      }
      if (typeof v === 'number') {
        return `${k}: ${v}`;
      }
      if (typeof v === 'boolean') {
        return `${k}: ${v ? 'sim' : 'não'}`;
      }
      return k;
    });
    return topKeys.length > 0 ? topKeys.join(' · ') : 'Dados de garantia disponíveis.';
  }

  return parts.join(' · ');
}
