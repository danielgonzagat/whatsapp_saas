import { Injectable, Logger } from '@nestjs/common';
import type {
  AbDeltaReport,
  AbExperimentSample,
  AbRollbackDecision,
  AbRollbackOptions,
} from './abi-ab.types';

const BUFFER_CAP = 10000;
const DEFAULT_MIN_SAMPLES_PER_PATH = 3;
const DEFAULT_MAX_SUCCESS_RATE_GAP_PCT = 5;
const DEFAULT_MAX_LATENCY_P95_MULTIPLIER = 2;

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  if (pct <= 0) return sorted[0] ?? 0;
  if (pct >= 1) return sorted[sorted.length - 1] ?? 0;
  const idx = (sorted.length - 1) * pct;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  return ((sorted[lo] ?? 0) * (hi - idx)) + ((sorted[hi] ?? 0) * (idx - lo));
}

@Injectable()
export class AbiAbTelemetryService {
  private readonly logger = new Logger(AbiAbTelemetryService.name);
  private readonly buffer: AbExperimentSample[] = [];

  public record(sample: AbExperimentSample): void {
    this.buffer.push(sample);
    if (this.buffer.length > BUFFER_CAP) {
      this.buffer.splice(0, this.buffer.length - BUFFER_CAP);
    }
    this.logger.debug(
      `recorded sample ${sample.sampleId} flow=${sample.flowName} abi=${sample.abiUsed} success=${sample.success}`,
    );
  }

  public reportDelta(flowName: string): AbDeltaReport {
    const legacyLatencies: number[] = [];
    const abiLatencies: number[] = [];
    let legacySuccess = 0;
    let abiSuccess = 0;

    for (const s of this.buffer) {
      if (s.flowName !== flowName) continue;
      if (s.abiUsed) {
        abiLatencies.push(s.latencyMs);
        if (s.success) abiSuccess++;
      } else {
        legacyLatencies.push(s.latencyMs);
        if (s.success) legacySuccess++;
      }
    }

    legacyLatencies.sort((a, b) => a - b);
    abiLatencies.sort((a, b) => a - b);

    return {
      flowName,
      legacy: {
        count: legacyLatencies.length,
        successRate: legacyLatencies.length === 0 ? 0 : legacySuccess / legacyLatencies.length,
        latencyP50Ms: percentile(legacyLatencies, 0.50),
        latencyP95Ms: percentile(legacyLatencies, 0.95),
      },
      abi: {
        count: abiLatencies.length,
        successRate: abiLatencies.length === 0 ? 0 : abiSuccess / abiLatencies.length,
        latencyP50Ms: percentile(abiLatencies, 0.50),
        latencyP95Ms: percentile(abiLatencies, 0.95),
      },
      computedAt: new Date().toISOString(),
    };
  }

  public shouldRollback(
    flowName: string,
    opts: AbRollbackOptions = {},
  ): AbRollbackDecision {
    const minSamples = opts.minSamplesPerPath ?? DEFAULT_MIN_SAMPLES_PER_PATH;
    const maxGapPct = opts.maxSuccessRateGapPct ?? DEFAULT_MAX_SUCCESS_RATE_GAP_PCT;
    const maxLatMultiplier = opts.maxLatencyP95Multiplier ?? DEFAULT_MAX_LATENCY_P95_MULTIPLIER;

    const delta = this.reportDelta(flowName);

    const insufficient = [];
    if (delta.legacy.count < minSamples) insufficient.push('legacy');
    if (delta.abi.count < minSamples) insufficient.push('abi');

    if (insufficient.length > 0) {
      return {
        shouldRollback: false,
        reason: `insufficient samples: ${insufficient.join(', ')} need >=${minSamples}`,
        delta,
        computedAt: delta.computedAt,
      };
    }

    const legacySuccess = delta.legacy.successRate * 100;
    const abiSuccess = delta.abi.successRate * 100;
    if (legacySuccess - abiSuccess > maxGapPct) {
      return {
        shouldRollback: true,
        reason: `ABI success rate ${abiSuccess.toFixed(1)}% >${maxGapPct}pp below legacy ${legacySuccess.toFixed(1)}%`,
        delta,
        computedAt: delta.computedAt,
      };
    }

    if (
      delta.legacy.latencyP95Ms > 0 &&
      delta.abi.latencyP95Ms > delta.legacy.latencyP95Ms * maxLatMultiplier
    ) {
      return {
        shouldRollback: true,
        reason: `ABI latency P95 ${delta.abi.latencyP95Ms}ms >${maxLatMultiplier}× legacy ${delta.legacy.latencyP95Ms}ms`,
        delta,
        computedAt: delta.computedAt,
      };
    }

    return {
      shouldRollback: false,
      delta,
      computedAt: delta.computedAt,
    };
  }

  public bufferSize(): number {
    return this.buffer.length;
  }

  public drain(): void {
    this.buffer.length = 0;
  }
}
