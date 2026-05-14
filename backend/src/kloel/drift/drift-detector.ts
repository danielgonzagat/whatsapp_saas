import type { BehaviorSnapshot, DriftReport, MetricBundle, MetricDeviation } from './drift.types';

const DRIFT_SIGMA_THRESHOLD = 1.5;

const METRIC_NAMES: ReadonlyArray<keyof MetricBundle> = [
  'conversionRate',
  'avgResponseMinutes',
  'avgConversionHours',
  'paymentSuccessRate',
  'churnRate',
] as const;

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: readonly number[], avg: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.reduce(
    (s, v) => s + (v - avg) * (v - avg),
    0,
  );
  return Math.sqrt(squaredDiffs / (values.length - 1));
}

function extractMetricValues(
  snapshots: readonly BehaviorSnapshot[],
  metricName: keyof MetricBundle,
): number[] {
  return snapshots.map((s) => {
    if (metricName === 'objectionMix') {
      return Object.values(s.metrics.objectionMix).reduce(
        (s2, v) => s2 + v,
        0,
      );
    }
    return s.metrics[metricName] as number;
  });
}

function computeDeviation(
  current: number,
  historicalValues: readonly number[],
  metricName: keyof MetricBundle,
): MetricDeviation {
  const historicalMean = mean(historicalValues);
  const historicalStdDev = stdDev(historicalValues, historicalMean);

  const delta = current - historicalMean;
  const deviationSigma =
    historicalStdDev > 0 ? Math.abs(delta) / historicalStdDev : delta !== 0 ? Infinity : 0;
  const direction: 'up' | 'down' = delta >= 0 ? 'up' : 'down';
  const isDrift = deviationSigma > DRIFT_SIGMA_THRESHOLD;

  return {
    metricName,
    currentValue: current,
    historicalMean,
    historicalStdDev,
    deviationSigma,
    direction,
    isDrift,
  };
}

export function detectDrift(
  currentSnapshot: BehaviorSnapshot,
  historicalSnapshots: readonly BehaviorSnapshot[],
): DriftReport {
  const now = new Date().toISOString();
  const sorted = [...historicalSnapshots].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );

  const comparedIds = sorted.map((s) => s.snapshotId);

  const deviations: MetricDeviation[] = [];

  for (const metricName of METRIC_NAMES) {
    const currentValue =
      metricName === 'objectionMix'
        ? Object.values(currentSnapshot.metrics.objectionMix).reduce(
            (s, v) => s + v,
            0,
          )
        : (currentSnapshot.metrics[metricName] as number);

    const historicalValues = extractMetricValues(sorted, metricName);
    if (historicalValues.length === 0) continue;

    deviations.push(
      computeDeviation(currentValue, historicalValues, metricName),
    );
  }

  const significantCount = deviations.filter((d) => d.isDrift).length;
  const overallDriftMagnitude =
    deviations.length > 0
      ? deviations.reduce((s, d) => s + d.deviationSigma, 0) /
        deviations.length
      : 0;

  return {
    driftId: `drift_${currentSnapshot.workspaceId}_${currentSnapshot.weekStart}`,
    workspaceId: currentSnapshot.workspaceId,
    snapshotId: currentSnapshot.snapshotId,
    comparedSnapshotIds: comparedIds,
    deviations,
    significantCount,
    overallDriftMagnitude,
    computedAt: now,
  };
}
