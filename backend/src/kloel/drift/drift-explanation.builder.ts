import type { BehaviorSnapshot, DriftExplanation, DriftReport, MetricDeviation } from './drift.types';

function explainDeviation(d: MetricDeviation): string {
  const directionText = d.direction === 'up' ? 'aumentou' : 'diminuiu';

  switch (d.metricName) {
    case 'conversionRate':
      if (d.direction === 'up') {
        return `a taxa de conversão de leads subiu para ${pct(d.currentValue)} (média anterior ${pct(d.historicalMean)}), o que indica que as abordagens estão mais efetivas`;
      }
      return `a taxa de conversão de leads caiu para ${pct(d.currentValue)} (média anterior ${pct(d.historicalMean)}), o que indica menor efetividade nas abordagens`;

    case 'avgResponseMinutes':
      if (d.direction === 'up') {
        return `o tempo médio de resposta ${directionText} para ${fmtMin(d.currentValue)} (média anterior ${fmtMin(d.historicalMean)}), leads estão esperando mais`;
      }
      return `o tempo médio de resposta ${directionText} para ${fmtMin(d.currentValue)} (média anterior ${fmtMin(d.historicalMean)}), leads sendo atendidos mais rápido`;

    case 'avgConversionHours':
      if (d.direction === 'up') {
        return `o ciclo de fechamento ${directionText} para ${fmtHours(d.currentValue)} (média anterior ${fmtHours(d.historicalMean)}), vendas estão levando mais tempo`;
      }
      return `o ciclo de fechamento ${directionText} para ${fmtHours(d.currentValue)} (média anterior ${fmtHours(d.historicalMean)}), vendas fechando mais rápido`;

    case 'paymentSuccessRate':
      if (d.direction === 'down') {
        return `a taxa de aprovação de pagamento caiu para ${pct(d.currentValue)} (média anterior ${pct(d.historicalMean)}), mais pagamentos sendo recusados`;
      }
      return `a taxa de aprovação de pagamento subiu para ${pct(d.currentValue)} (média anterior ${pct(d.historicalMean)}), menos recusas`;

    case 'churnRate':
      if (d.direction === 'up') {
        return `a taxa de churn ${directionText} para ${pct(d.currentValue)} (média anterior ${pct(d.historicalMean)}), mais clientes em risco de cancelamento`;
      }
      return `a taxa de churn ${directionText} para ${pct(d.currentValue)} (média anterior ${pct(d.historicalMean)}), retenção melhorando`;

    case 'objectionMix':
      if (d.direction === 'up') {
        return `o volume de objeções ${directionText} (média anterior ${d.historicalMean.toFixed(1)}), mais resistência de leads`;
      }
      return `o volume de objeções ${directionText} (média anterior ${d.historicalMean.toFixed(1)}), leads com menos resistência`;

    default:
      return `${d.metricName} ${directionText} para ${d.currentValue} (média anterior ${d.historicalMean.toFixed(2)})`;
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMin(v: number): string {
  if (v < 60) return `${Math.round(v)} min`;
  return `${(v / 60).toFixed(1)}h`;
}

function fmtHours(v: number): string {
  if (v < 24) return `${Math.round(v)}h`;
  return `${(v / 24).toFixed(1)} dias`;
}

export function buildExplanation(
  driftReport: DriftReport,
  currentSnapshot: BehaviorSnapshot,
  opts: { readonly nowIso?: string } = {},
): DriftExplanation {
  const significant = driftReport.deviations.filter((d) => d.isDrift);

  if (significant.length === 0) {
    return {
      driftId: driftReport.driftId,
      workspaceId: driftReport.workspaceId,
      summary: `Nenhuma mudança significativa detectada na semana de ${currentSnapshot.weekStart} a ${currentSnapshot.weekEnd}. O desempenho comercial está estável.`,
      details: [],
      weekStart: currentSnapshot.weekStart,
      weekEnd: currentSnapshot.weekEnd,
      computedAt: opts.nowIso ?? new Date().toISOString(),
    };
  }

  const details = significant.map((d) => explainDeviation(d));

  const directionCount = {
    up: significant.filter((d) => d.direction === 'up').length,
    down: significant.filter((d) => d.direction === 'down').length,
  };

  let summary: string;
  if (directionCount.up > directionCount.down) {
    summary = `${significant.length} métrica(s) com mudança significativa na semana de ${currentSnapshot.weekStart} — maioria de aumentos.`;
  } else if (directionCount.down > directionCount.up) {
    summary = `${significant.length} métrica(s) com mudança significativa na semana de ${currentSnapshot.weekStart} — maioria de quedas.`;
  } else {
    summary = `${significant.length} métrica(s) com mudança significativa na semana de ${currentSnapshot.weekStart}.`;
  }

  return {
    driftId: driftReport.driftId,
    workspaceId: driftReport.workspaceId,
    summary,
    details,
    weekStart: currentSnapshot.weekStart,
    weekEnd: currentSnapshot.weekEnd,
    computedAt: opts.nowIso ?? new Date().toISOString(),
  };
}
