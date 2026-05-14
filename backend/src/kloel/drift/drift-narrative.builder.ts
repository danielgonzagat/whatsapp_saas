import type { BehaviorSnapshot, DriftReport, DriftStoryBeat, DriftNarrative } from './drift.types';

function snapToStoryBeat(
  current: BehaviorSnapshot,
  previous: BehaviorSnapshot | undefined,
): DriftStoryBeat[] {
  const beats: DriftStoryBeat[] = [];
  const m = current.metrics;
  const p = previous?.metrics;

  beats.push({
    metric: 'conversionRate',
    beforeValue: p ? `${(p.conversionRate * 100).toFixed(1)}%` : '—',
    afterValue: `${(m.conversionRate * 100).toFixed(1)}%`,
    changeDirection: p
      ? m.conversionRate > p.conversionRate * 1.02
        ? 'improved'
        : m.conversionRate < p.conversionRate * 0.98
          ? 'worsened'
          : 'stable'
      : 'stable',
    explanation: p
      ? `Taxa de conversão de leads: de ${(p.conversionRate * 100).toFixed(1)}% para ${(m.conversionRate * 100).toFixed(1)}%`
      : `Taxa de conversão de leads: ${(m.conversionRate * 100).toFixed(1)}%`,
  });

  beats.push({
    metric: 'avgResponseMinutes',
    beforeValue: p ? fmtMin2(p.avgResponseMinutes) : '—',
    afterValue: fmtMin2(m.avgResponseMinutes),
    changeDirection: p
      ? m.avgResponseMinutes < p.avgResponseMinutes * 0.95
        ? 'improved'
        : m.avgResponseMinutes > p.avgResponseMinutes * 1.05
          ? 'worsened'
          : 'stable'
      : 'stable',
    explanation: p
      ? `Tempo médio de resposta: de ${fmtMin2(p.avgResponseMinutes)} para ${fmtMin2(m.avgResponseMinutes)}`
      : `Tempo médio de resposta: ${fmtMin2(m.avgResponseMinutes)}`,
  });

  beats.push({
    metric: 'avgConversionHours',
    beforeValue: p ? fmtHours2(p.avgConversionHours) : '—',
    afterValue: fmtHours2(m.avgConversionHours),
    changeDirection: p
      ? m.avgConversionHours < p.avgConversionHours * 0.95
        ? 'improved'
        : m.avgConversionHours > p.avgConversionHours * 1.05
          ? 'worsened'
          : 'stable'
      : 'stable',
    explanation: p
      ? `Ciclo de fechamento: de ${fmtHours2(p.avgConversionHours)} para ${fmtHours2(m.avgConversionHours)}`
      : `Ciclo de fechamento: ${fmtHours2(m.avgConversionHours)}`,
  });

  beats.push({
    metric: 'paymentSuccessRate',
    beforeValue: p ? `${(p.paymentSuccessRate * 100).toFixed(1)}%` : '—',
    afterValue: `${(m.paymentSuccessRate * 100).toFixed(1)}%`,
    changeDirection: p
      ? m.paymentSuccessRate > p.paymentSuccessRate * 1.01
        ? 'improved'
        : m.paymentSuccessRate < p.paymentSuccessRate * 0.99
          ? 'worsened'
          : 'stable'
      : 'stable',
    explanation: p
      ? `Aprovação de pagamento: de ${(p.paymentSuccessRate * 100).toFixed(1)}% para ${(m.paymentSuccessRate * 100).toFixed(1)}%`
      : `Aprovação de pagamento: ${(m.paymentSuccessRate * 100).toFixed(1)}%`,
  });

  beats.push({
    metric: 'churnRate',
    beforeValue: p ? `${(p.churnRate * 100).toFixed(1)}%` : '—',
    afterValue: `${(m.churnRate * 100).toFixed(1)}%`,
    changeDirection: p
      ? m.churnRate < p.churnRate * 0.98
        ? 'improved'
        : m.churnRate > p.churnRate * 1.02
          ? 'worsened'
          : 'stable'
      : 'stable',
    explanation: p
      ? `Churn: de ${(p.churnRate * 100).toFixed(1)}% para ${(m.churnRate * 100).toFixed(1)}%`
      : `Churn: ${(m.churnRate * 100).toFixed(1)}%`,
  });

  return beats;
}

function fmtMin2(v: number): string {
  if (v === 0) return '0 min';
  if (v < 60) return `${Math.round(v)} min`;
  return `${(v / 60).toFixed(1)}h`;
}

function fmtHours2(v: number): string {
  if (v === 0) return '0h';
  if (v < 24) return `${Math.round(v)}h`;
  return `${(v / 24).toFixed(1)} dias`;
}

export function buildNarrative(
  currentSnapshot: BehaviorSnapshot,
  previousSnapshot: BehaviorSnapshot | undefined,
  driftReport: DriftReport | undefined,
  opts: { readonly nowIso?: string } = {},
): DriftNarrative {
  const beats = snapToStoryBeat(currentSnapshot, previousSnapshot);

  const improved = beats.filter((b) => b.changeDirection === 'improved').length;
  const worsened = beats.filter((b) => b.changeDirection === 'worsened').length;

  let headline: string;
  if (improved > worsened) {
    headline = `Semana ${currentSnapshot.weekStart}: ${improved} métricas melhoraram — seu negócio está ganhando tração`;
  } else if (worsened > improved) {
    headline = `Semana ${currentSnapshot.weekStart}: ${worsened} métricas pioraram — atenção necessária`;
  } else if (driftReport && driftReport.significantCount > 0) {
    headline = `Semana ${currentSnapshot.weekStart}: ${driftReport.significantCount} mudanças significativas detectadas`;
  } else {
    headline = `Semana ${currentSnapshot.weekStart}: operação estável`;
  }

  return {
    workspaceId: currentSnapshot.workspaceId,
    weekStart: currentSnapshot.weekStart,
    weekEnd: currentSnapshot.weekEnd,
    headline,
    story: beats,
    computedAt: opts.nowIso ?? new Date().toISOString(),
  };
}
