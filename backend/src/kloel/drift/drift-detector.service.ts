import type { DriftDimension, DriftResult, ToneClass, WeeklyBehaviorSnapshot } from './drift.types';

const ALL_TONES: readonly ToneClass[] = [
  'assertivo',
  'consultivo',
  'empatico',
  'analitico',
  'urgente',
  'neutro',
] as const;

const DIMENSION_COUNT = 6;

function clamp01(v: number): number {
  if (v < 0) {return 0;}
  if (v > 1) {return 1;}
  return v;
}

function ratioChange(before: number, after: number): number {
  if (before === 0 && after === 0) {return 0;}
  if (before === 0) {return 1;}
  return Math.abs(after - before) / Math.max(before, after);
}

function jaccardSimilarity(
  a: readonly string[],
  b: readonly string[],
): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) {return 1;}
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {intersection++;}
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function toneDistributionSimilarity(
  a: Record<ToneClass, number>,
  b: Record<ToneClass, number>,
): number {
  const sumA = ALL_TONES.reduce((s, t) => s + a[t], 0);
  const sumB = ALL_TONES.reduce((s, t) => s + b[t], 0);
  if (sumA === 0 && sumB === 0) {return 1;}
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const t of ALL_TONES) {
    const va = sumA > 0 ? a[t] / sumA : 0;
    const vb = sumB > 0 ? b[t] / sumB : 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) {return 0;}
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function patternOverlapScore(
  a: readonly { readonly pattern: string }[],
  b: readonly { readonly pattern: string }[],
): number {
  const setA = new Set(a.map((p) => p.pattern));
  const setB = new Set(b.map((p) => p.pattern));
  if (setA.size === 0 && setB.size === 0) {return 1;}
  let intersection = 0;
  for (const p of setA) {
    if (setB.has(p)) {intersection++;}
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function computeDimensions(
  current: WeeklyBehaviorSnapshot,
  previous: WeeklyBehaviorSnapshot,
): DriftDimension[] {
  const dims: DriftDimension[] = [];

  const msgScore = clamp01(ratioChange(previous.messagesSent, current.messagesSent));
  dims.push({
    dimension: 'messagesSent',
    before: previous.messagesSent,
    after: current.messagesSent,
    score: msgScore,
    drifted: msgScore > 0.3,
  });

  const decisionsSimilarity = jaccardSimilarity(
    previous.decisionsRanked,
    current.decisionsRanked,
  );
  dims.push({
    dimension: 'decisionsRanked',
    before: previous.decisionsRanked.slice(0, 3).join(', ') || '(none)',
    after: current.decisionsRanked.slice(0, 3).join(', ') || '(none)',
    score: 1 - decisionsSimilarity,
    drifted: decisionsSimilarity < 0.7,
  });

  const conversionScore = clamp01(
    ratioChange(previous.conversionsAttributed, current.conversionsAttributed),
  );
  dims.push({
    dimension: 'conversionsAttributed',
    before: previous.conversionsAttributed,
    after: current.conversionsAttributed,
    score: conversionScore,
    drifted: conversionScore > 0.3,
  });

  const styleChanged = previous.narrativeStyleHash !== current.narrativeStyleHash;
  dims.push({
    dimension: 'narrativeStyleHash',
    before: previous.narrativeStyleHash,
    after: current.narrativeStyleHash,
    score: styleChanged ? 1 : 0,
    drifted: styleChanged,
  });

  const toneSim = toneDistributionSimilarity(
    previous.toneClassification,
    current.toneClassification,
  );
  dims.push({
    dimension: 'toneClassification',
    before: stylesummary(previous.toneClassification),
    after: stylesummary(current.toneClassification),
    score: 1 - toneSim,
    drifted: toneSim < 0.7,
  });

  const patScore = 1 - patternOverlapScore(
    previous.decisionPatterns,
    current.decisionPatterns,
  );
  dims.push({
    dimension: 'decisionPatterns',
    before: previous.decisionPatterns.length,
    after: current.decisionPatterns.length,
    score: patScore,
    drifted: patScore > 0.4,
  });

  return dims;
}

function stylesummary(tone: Record<ToneClass, number>): string {
  const total = ALL_TONES.reduce((s, t) => s + tone[t], 0);
  if (total === 0) {return 'vazio';}
  const dominant = ALL_TONES.reduce((best, t) =>
    tone[t] > tone[best] ? t : best,
  );
  const pct = Math.round((tone[dominant] / total) * 100);
  return `${dominant} (${pct}%)`;
}

function buildNarrative(
  dims: readonly DriftDimension[],
  current: WeeklyBehaviorSnapshot,
  previous: WeeklyBehaviorSnapshot,
): string {
  const drifted = dims.filter((d) => d.drifted);
  const stable = dims.filter((d) => !d.drifted);

  if (drifted.length === 0) {
    return 'Comportamento estável. Nenhuma dimensao apresentou desvio significativo em relacao a semana anterior.';
  }

  const parts = ['Mudancas de comportamento detectadas:'];

  for (const d of drifted) {
    switch (d.dimension) {
      case 'messagesSent':
        parts.push(
          `- Volume de mensagens: ${d.before} → ${d.after} (${deltaPct(d)}).`,
        );
        break;
      case 'decisionsRanked':
        parts.push(
          `- Decisoes priorizadas: "${d.before}" → "${d.after}".`,
        );
        break;
      case 'conversionsAttributed':
        parts.push(
          `- Conversoes: ${d.before} → ${d.after} (${deltaPct(d)}).`,
        );
        break;
      case 'narrativeStyleHash':
        parts.push('- Estilo narrativo mudou significativamente.');
        break;
      case 'toneClassification':
        parts.push(
          `- Tom de comunicacao: ${d.before} → ${d.after}.`,
        );
        break;
      case 'decisionPatterns':
        parts.push(
          `- Padroes de decisao: ${d.before} padroes → ${d.after} padroes.`,
        );
        break;
    }
  }

  if (stable.length > 0) {
    parts.push(
      `Dimensoes estaveis: ${stable.map((d) => d.dimension).join(', ')}.`,
    );
  }

  const mag = Math.round(
    (drifted.length / DIMENSION_COUNT) * 100,
  );
  parts.push(
    `Magnitude de drift: ${mag}%. Semana ${previous.weekStart} → ${current.weekStart}.`,
  );

  return parts.join('\n');
}

function deltaPct(d: DriftDimension): string {
  const before = Number(d.before);
  const after = Number(d.after);
  if (Number.isNaN(before) || Number.isNaN(after)) {return 'n/a';}
  if (before === 0 && after === 0) {return '0%';}
  if (before === 0) {return '+∞';}
  const pct = Math.round(((after - before) / before) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

export class DriftDetectorService {
  compare(
    current: WeeklyBehaviorSnapshot,
    previous: WeeklyBehaviorSnapshot,
  ): DriftResult {
    const parts = computeDimensions(current, previous);
    const totalScore = parts.reduce((s, d) => s + d.score, 0);
    const magnitude = clamp01(totalScore / DIMENSION_COUNT);
    const driftedDimensions = parts
      .filter((d) => d.drifted)
      .map((d) => d.dimension);
    const narrative = buildNarrative(parts, current, previous);

    return {
      snapshotId: current.snapshotId,
      comparedSnapshotId: previous.snapshotId,
      workspaceId: current.workspaceId,
      driftedDimensions,
      magnitude: Math.round(magnitude * 100) / 100,
      narrative,
      details: parts,
      computedAt: new Date().toISOString(),
    };
  }
}
