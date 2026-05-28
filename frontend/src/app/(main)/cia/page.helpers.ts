import type { CiaSurfaceResponse } from '@/lib/api';

// Shared formatters/regex live in ./utils (canonical). Re-export to preserve
// the page.helpers public surface used by page.panels.tsx, page.proof-panels.tsx.
export {
  formatCurrency,
  formatPhaseLabel,
  formatTs,
  workItemStateBadgeVariant,
  PATTERN_RE_2,
} from './utils';

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
