import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  AbCommercialOutcomeDetectorFn,
  AbHarnessRecord,
  AbPathRunnerFn,
  AbPathRunnerResult,
  AbPromotionDecision,
  AbRCriterionDelta,
} from './abi-ab.types';
import {
  PROMOTION_MIN_SAMPLES,
  PROMOTION_MIN_IMPROVED_CRITERIA,
  R_CRITERIA,
  generateId,
  clamp01,
  extractClaimsFromText,
  estimateCommercialOutcome,
  aggregateMetrics,
  projectRScore,
} from './abi-ab-harness.service.helpers';
export const ABI_PATH_RUNNER = Symbol('ABI_PATH_RUNNER');
export const ABI_COMMERCIAL_OUTCOME_DETECTOR = Symbol('ABI_COMMERCIAL_OUTCOME_DETECTOR');
@Injectable()
export class AbiAbHarnessService {
  private readonly logger = new Logger(AbiAbHarnessService.name);
  private readonly store = new Map<string, AbHarnessRecord[]>();
  private readonly pathRunner: AbPathRunnerFn;
  private readonly commercialOutcomeDetector: AbCommercialOutcomeDetectorFn;
  constructor(
    @Optional() @Inject(ABI_PATH_RUNNER) pathRunner: AbPathRunnerFn | null,
    @Optional()
    @Inject(ABI_COMMERCIAL_OUTCOME_DETECTOR)
    commercialOutcomeDetector: AbCommercialOutcomeDetectorFn | null,
  ) {
    this.pathRunner = pathRunner ?? this.noopPathRunner;
    this.commercialOutcomeDetector = commercialOutcomeDetector ?? estimateCommercialOutcome;
  }
  private readonly noopPathRunner: AbPathRunnerFn = async () => ({
    success: false,
    latencyMs: 0,
    tokensUsed: 0,
    responseText: 'ABI_PATH_RUNNER not configured',
  });
  public async runParallel(
    workspaceId: string,
    userMessage: string,
  ): Promise<{ baseline: AbHarnessRecord; variant: AbHarnessRecord }> {
    const [baselineResult, variantResult] = await Promise.all([
      this.pathRunner({ workspaceId, userMessage, useAbi: false }),
      this.pathRunner({ workspaceId, userMessage, useAbi: true }),
    ]);
    const baselineRecord = this.buildRecord(workspaceId, userMessage, false, baselineResult);
    const variantRecord = this.buildRecord(workspaceId, userMessage, true, variantResult);
    this.record(baselineRecord);
    this.record(variantRecord);
    this.logger.debug(
      `parallel run complete ws=${workspaceId} baseline=${baselineRecord.recordId} variant=${variantRecord.recordId}`,
    );
    return { baseline: baselineRecord, variant: variantRecord };
  }
  public record(record: AbHarnessRecord): void {
    const records = this.store.get(record.workspaceId) ?? [];
    records.push(record);
    this.store.set(record.workspaceId, records);
  }
  public getRecordsForWorkspace(workspaceId: string): AbHarnessRecord[] {
    return this.store.get(workspaceId) ?? [];
  }
  public hallucinatedFacts(records: AbHarnessRecord[]): number {
    let count = 0;
    for (const r of records) {
      for (const c of r.claims) {
        if (!c.hasProof) {
          count++;
        }
      }
    }
    return count;
  }
  public totalClaims(records: AbHarnessRecord[]): number {
    let count = 0;
    for (const r of records) {
      count += r.claims.length;
    }
    return count;
  }
  public hallucinationRate(records: AbHarnessRecord[]): number {
    const total = this.totalClaims(records);
    if (total === 0) {
      return 0;
    }
    return this.hallucinatedFacts(records) / total;
  }
  public computeRDelta(workspaceId: string): AbRCriterionDelta[] {
    const records = this.getRecordsForWorkspace(workspaceId);
    const deltas: AbRCriterionDelta[] = [];
    const baseline = records.filter((r) => !r.abiUsed);
    const variant = records.filter((r) => r.abiUsed);
    if (baseline.length === 0 && variant.length === 0) {
      for (const crit of R_CRITERIA) {
        deltas.push({
          criterion: crit,
          baselineScore: 0,
          variantScore: 0,
          delta: 0,
          direction: 'unchanged',
        });
      }
      return deltas;
    }
    const bMetrics = aggregateMetrics(baseline);
    const vMetrics = aggregateMetrics(variant);
    for (const crit of R_CRITERIA) {
      const bScore = projectRScore(crit.name, bMetrics, baseline.length);
      const vScore = projectRScore(crit.name, vMetrics, variant.length);
      const rawDelta = vScore - bScore;
      let direction: 'improved' | 'regressed' | 'unchanged';
      if (rawDelta > 0.001) {
        direction = 'improved';
      } else if (rawDelta < -0.001) {
        direction = 'regressed';
      } else {
        direction = 'unchanged';
      }
      deltas.push({
        criterion: crit,
        baselineScore: clamp01(bScore),
        variantScore: clamp01(vScore),
        delta: rawDelta,
        direction,
      });
    }
    return deltas;
  }
  public decidePromotion(workspaceId: string): AbPromotionDecision {
    const records = this.getRecordsForWorkspace(workspaceId);
    const sampleSize = records.length;
    const deltas = this.computeRDelta(workspaceId);
    if (sampleSize < PROMOTION_MIN_SAMPLES) {
      return {
        promoteVariantToDefault: false,
        reason: `insufficient sample size: ${sampleSize} < ${PROMOTION_MIN_SAMPLES} (min required for promotion)`,
        workspaceId,
        sampleSize,
        minSamplesRequired: PROMOTION_MIN_SAMPLES,
        criteriaImproved: 0,
        criteriaRegressed: 0,
        criteriaUnchanged: deltas.length,
        totalCriteria: deltas.length,
        deltas,
        computedAt: new Date().toISOString(),
      };
    }
    let improved = 0;
    let regressed = 0;
    let unchanged = 0;
    for (const d of deltas) {
      if (d.direction === 'improved') {
        improved++;
      } else if (d.direction === 'regressed') {
        regressed++;
      } else {
        unchanged++;
      }
    }
    if (regressed > 0) {
      return {
        promoteVariantToDefault: false,
        reason: `regression detected in ${regressed} R-criteria: zero regression required for promotion`,
        workspaceId,
        sampleSize,
        minSamplesRequired: PROMOTION_MIN_SAMPLES,
        criteriaImproved: improved,
        criteriaRegressed: regressed,
        criteriaUnchanged: unchanged,
        totalCriteria: deltas.length,
        deltas,
        computedAt: new Date().toISOString(),
      };
    }
    if (improved < PROMOTION_MIN_IMPROVED_CRITERIA) {
      return {
        promoteVariantToDefault: false,
        reason: `insufficient improved criteria: ${improved} < ${PROMOTION_MIN_IMPROVED_CRITERIA} (min required for promotion)`,
        workspaceId,
        sampleSize,
        minSamplesRequired: PROMOTION_MIN_SAMPLES,
        criteriaImproved: improved,
        criteriaRegressed: regressed,
        criteriaUnchanged: unchanged,
        totalCriteria: deltas.length,
        deltas,
        computedAt: new Date().toISOString(),
      };
    }
    return {
      promoteVariantToDefault: true,
      reason: `variant meets all promotion gates: ${improved} improved, 0 regressed, ${sampleSize} samples >= ${PROMOTION_MIN_SAMPLES} min`,
      workspaceId,
      sampleSize,
      minSamplesRequired: PROMOTION_MIN_SAMPLES,
      criteriaImproved: improved,
      criteriaRegressed: regressed,
      criteriaUnchanged: unchanged,
      totalCriteria: deltas.length,
      deltas,
      computedAt: new Date().toISOString(),
    };
  }
  public clearWorkspace(workspaceId: string): void {
    this.store.delete(workspaceId);
  }
  public workspaceCount(): number {
    return this.store.size;
  }
  private buildRecord(
    workspaceId: string,
    userMessage: string,
    abiUsed: boolean,
    result: AbPathRunnerResult,
  ): AbHarnessRecord {
    const claims = extractClaimsFromText(result.responseText);
    const commercialOutcome = this.commercialOutcomeDetector({
      responseText: result.responseText,
      workspaceId,
    });
    return {
      recordId: generateId(),
      workspaceId,
      userMessage,
      abiUsed,
      latencyMs: result.latencyMs,
      tokensUsed: result.tokensUsed,
      success: result.success,
      claims,
      commercialOutcome,
      collectedAt: new Date().toISOString(),
    };
  }

}
