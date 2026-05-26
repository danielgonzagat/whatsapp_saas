import { fail, Gate, GateEvidence, GateMode, GateVerdict, pass } from './pulse-gates.types';

export interface RecommendationEntry {
  readonly recommendationId: string;
  readonly productId: string;
  readonly productSource: 'internal' | 'external';
  readonly qualityScore: number;
  readonly weight: number;
  readonly internalRevenue: number;
  readonly hasCommercialLink: boolean;
  readonly commercialLinkDisclosed: boolean;
}

export interface PlatformBiasMonitorInput {
  readonly recommendations: readonly RecommendationEntry[];
  readonly significanceThreshold?: number;
  readonly weightMarginThreshold?: number;
  readonly minSampleSize?: number;
}

const MEASURED_BY = 'platform-bias-monitor.gate' as const;

const DEFAULT_SIGNIFICANCE_THRESHOLD = 0.05;
const DEFAULT_WEIGHT_MARGIN_THRESHOLD = 0.2;
const DEFAULT_MIN_SAMPLE_SIZE = 3;

function mean(values: number[]): number {
  if (values.length === 0) {return 0;}
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[], avg: number): number {
  if (values.length <= 1) {return 0;}
  const sumSq = values.reduce((s, v) => s + (v - avg) * (v - avg), 0);
  return sumSq / (values.length - 1);
}

function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * absX);
  const erf =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

function twoTailedPValue(zScore: number): number {
  const absZ = Math.abs(zScore);
  const upper = 1 - normalCdf(absZ);
  return Math.min(2 * upper, 1);
}

interface BiasEvidence {
  readonly path: string;
  readonly detail: string;
}

export function makePlatformBiasMonitorGate(
  mode: GateMode = 'log_only',
): Gate<PlatformBiasMonitorInput> {
  return {
    name: 'platform-bias-monitor',
    mode,
    check: (input: PlatformBiasMonitorInput): GateVerdict => {
      const evidence: GateEvidence[] = [];
      const significanceThreshold =
        input.significanceThreshold ?? DEFAULT_SIGNIFICANCE_THRESHOLD;
      const weightMarginThreshold =
        input.weightMarginThreshold ?? DEFAULT_WEIGHT_MARGIN_THRESHOLD;
      const minSampleSize = input.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;

      const recs = input.recommendations;

      if (!recs || recs.length === 0) {
        return pass('platform-bias-monitor', mode, MEASURED_BY);
      }

      const internalRecs = recs.filter(
        (r) => r.productSource === 'internal',
      );
      const externalRecs = recs.filter(
        (r) => r.productSource === 'external',
      );

      const internalWeights = internalRecs.map((r) => r.weight);
      const externalWeights = externalRecs.map((r) => r.weight);

      const internalMean = mean(internalWeights);
      const externalMean = mean(externalWeights);

      // 1. Weight bias detection
      if (
        internalRecs.length >= minSampleSize &&
        externalRecs.length >= minSampleSize
      ) {
        const weightDiff = internalMean - externalMean;
        const relativeDiff =
          externalMean > 0
            ? weightDiff / externalMean
            : weightDiff > 0
              ? 1
              : 0;

        if (relativeDiff >= weightMarginThreshold) {
          const internalVar = variance(internalWeights, internalMean);
          const externalVar = variance(externalWeights, externalMean);

          const se = Math.sqrt(
            internalVar / internalRecs.length +
              externalVar / externalRecs.length,
          );
          const zScore = se > 0 ? (internalMean - externalMean) / se : 0;
          const pValue = twoTailedPValue(zScore);

          if (pValue < significanceThreshold) {
            evidence.push({
              path: '$.recommendations',
              detail: `statistically significant weight bias detected: internal mean=${internalMean.toFixed(4)} vs external mean=${externalMean.toFixed(4)} (diff=${weightDiff.toFixed(4)}, relative=${(relativeDiff * 100).toFixed(1)}%, p=${pValue.toFixed(4)}, threshold=${significanceThreshold})`,
            });
          }
        }
      }

      // 2. Quality-adjusted bias: platform products boosted vs external with equivalent quality
      if (internalRecs.length > 0 && externalRecs.length > 0) {
        const qualityBiasIssues: BiasEvidence[] = [];

        for (const intRec of internalRecs) {
          const sameQualityExternals = externalRecs.filter(
            (ext) =>
              Math.abs(ext.qualityScore - intRec.qualityScore) <= 0.05,
          );
          if (sameQualityExternals.length < minSampleSize) {continue;}

          const extAvgWeight = mean(
            sameQualityExternals.map((e) => e.weight),
          );

          if (
            extAvgWeight > 0 &&
            (intRec.weight - extAvgWeight) / extAvgWeight >=
              weightMarginThreshold
          ) {
            qualityBiasIssues.push({
              path: `$.recommendations[productId=${intRec.productId}]`,
              detail: `platform product "${intRec.productId}" (quality=${intRec.qualityScore}) weighted ${intRec.weight} vs external avg ${extAvgWeight.toFixed(4)} for same quality band (${sameQualityExternals.length} comparable external(s))`,
            });
          }
        }

        if (qualityBiasIssues.length > 0) {
          evidence.push({
            path: '$.recommendations',
            detail: `${qualityBiasIssues.length} platform product(s) systematically boosted vs external with equivalent quality`,
          });
          for (const qi of qualityBiasIssues) {
            evidence.push({ path: qi.path, detail: qi.detail });
          }
        }
      }

      // 3. Disclosure violations
      const undisclosedRecs = recs.filter(
        (r) => r.hasCommercialLink && !r.commercialLinkDisclosed,
      );

      if (undisclosedRecs.length > 0) {
        for (const rec of undisclosedRecs) {
          evidence.push({
            path: `$.recommendations[recommendationId=${rec.recommendationId}]`,
            detail: `commercial link for product "${rec.productId}" not disclosed (recommendationId=${rec.recommendationId})`,
          });
        }
      }

      if (evidence.length === 0) {
        return pass('platform-bias-monitor', mode, MEASURED_BY);
      }

      return fail(
        'platform-bias-monitor',
        mode,
        MEASURED_BY,
        `${evidence.length} platform bias violation(s) detected`,
        evidence,
      );
    },
  };
}
