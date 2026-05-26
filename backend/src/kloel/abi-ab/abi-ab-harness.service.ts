import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AbClaimEvidence, AbCommercialOutcome, AbCommercialOutcomeDetectorFn, AbHarnessRecord, AbPathRunnerFn, AbPathRunnerResult, AbPromotionDecision, AbRCriterionDelta, AbRCriterionDescriptor, AbRCriterionName } from './abi-ab.types';
import { randomIdSegment } from '../../common/random-id';
export const ABI_PATH_RUNNER = Symbol('ABI_PATH_RUNNER');
export const ABI_COMMERCIAL_OUTCOME_DETECTOR = Symbol('ABI_COMMERCIAL_OUTCOME_DETECTOR');
const PROMOTION_MIN_SAMPLES = 100;
const PROMOTION_MIN_IMPROVED_CRITERIA = 3;
const R_CRITERIA: AbRCriterionDescriptor[] = [
  { name: 'R1', family: 'GoalField', description: 'Commercial recovery' },
  { name: 'R2', family: 'GoalField', description: 'Reduced human work' },
  { name: 'R3', family: 'Trust', description: 'Timing intelligence' },
  { name: 'R4', family: 'Memory', description: 'Useful memory perceived' },
  { name: 'R5', family: 'LocalIdentity', description: 'Perceptible learning' },
  { name: 'R6', family: 'Movement', description: 'Worker dashboard operational' },
  { name: 'R7', family: 'Team', description: 'Comparison vs human team' },
  { name: 'R8', family: 'LocalIdentity', description: 'Perceived intelligence' },
  { name: 'R9', family: 'Wow', description: 'Two stages of intelligence' },
  { name: 'R10', family: 'Insight', description: 'Strategic insight' },
  { name: 'R11', family: 'Maturity', description: 'Stage adequacy' },
  { name: 'R12', family: 'Trust', description: 'Trust capital protected' },
  { name: 'R13', family: 'Drift', description: 'Behavioral drift observable' },
  { name: 'R14', family: 'Wisdom', description: 'Cross-workspace wisdom' },
  { name: 'R15', family: 'Wow', description: 'First-hour wow' },
  { name: 'R16', family: 'Team', description: 'Team acceptance' },
  { name: 'R17', family: 'Delegation', description: 'Delegation confidence' },
  { name: 'R18', family: 'Recovery', description: 'Error recovery' },
  { name: 'R19', family: 'Offer', description: 'Offer evolution' },
  { name: 'R20', family: 'OwnerCriterion', description: 'Owner criterion memory' },
  { name: 'R21', family: 'ColdStart', description: 'Cold-start discovery' },
  { name: 'R22', family: 'PostSale', description: 'Post-sale LTV' },
  { name: 'R23', family: 'HealthyMoney', description: 'Healthy money' },
  { name: 'R24', family: 'HypothesisProof', description: 'Discovery proven' },
  { name: 'R25', family: 'CommercialMemory', description: 'Proprietary memory' },
  { name: 'R26', family: 'Clarity', description: 'Decision clarity' },
  { name: 'R27', family: 'Role', description: 'Role-aware' },
  { name: 'R28', family: 'Affiliate', description: 'Affiliate intelligence' },
  { name: 'R29', family: 'Agency', description: 'Agency intelligence' },
  { name: 'R30', family: 'Creator', description: 'Creator intelligence' },
  { name: 'R31', family: 'Ecosystem', description: 'Ecosystem intelligence' },
  { name: 'R32', family: 'Channel', description: 'Channel survival' },
  { name: 'R33', family: 'Cash', description: 'Cash as oxygen' },
  { name: 'R34', family: 'Defensibility', description: 'User defensibility' },
  { name: 'R35', family: 'Movement', description: 'Real movement' },
  { name: 'R36', family: 'Evolution', description: 'Self-evolution' },
  { name: 'R37', family: 'Legitimacy', description: 'Operational legitimacy' },
  { name: 'R38', family: 'Incentive', description: 'Incentive integrity' },
];
function generateId(): string {
  return `rec_${Date.now()}_${randomIdSegment(8)}`;
}
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
function avg(arr: number[], fallback: number = 0): number {
  if (arr.length === 0) {return fallback;}
  return sum(arr) / arr.length;
}
function ratio(numerator: number, denominator: number, fallback: number = 0): number {
  if (denominator === 0) {return fallback;}
  return numerator / denominator;
}
function clamp01(value: number): number {
  if (value <= 0) {return 0;}
  if (value >= 1) {return 1;}
  return value;
}
function extractClaimsFromText(text: string): AbClaimEvidence[] {
  const claims: AbClaimEvidence[] = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const hasProof = /segundo|de acordo com|conforme|fonte|dados mostram|pesquisa|relat.rio|evid.ncia/i.test(trimmed);
    claims.push({
      claim: trimmed.slice(0, 200),
      hasProof,
      proofSource: hasProof ? 'text-reference' : null,
    });
  }
  return claims;
}
function estimateCommercialOutcome(params: {
  readonly responseText: string;
  readonly workspaceId: string;
}): AbCommercialOutcome | null {
  const text = params.responseText.toLowerCase();
  const conversionKeywords = ['comprar', 'clique aqui', 'aproveite', 'oferta', 'desconto', 'adquirir', 'garantir', 'última chance', 'exclusivo', 'compre agora'];
  const satisfactionKeywords = ['obrigado', 'obrigada', 'excelente', 'satisfeito', 'gostei', 'perfeito', 'resolvido', 'ajudou', 'agradeço', 'valeu'];
  const hasConversion = conversionKeywords.some((kw) => text.includes(kw));
  const hasSatisfaction = satisfactionKeywords.some((kw) => text.includes(kw));
  if (!hasConversion && !hasSatisfaction) {return null;}
  return {
    conversionSignal: hasConversion,
    satisfactionSignal: hasSatisfaction ? hasSatisfaction : null,
  };
}
@Injectable()
export class AbiAbHarnessService {
  private readonly logger = new Logger(AbiAbHarnessService.name);
  private readonly store = new Map<string, AbHarnessRecord[]>();
  private readonly pathRunner: AbPathRunnerFn;
  private readonly commercialOutcomeDetector: AbCommercialOutcomeDetectorFn;
  constructor(
    @Optional() @Inject(ABI_PATH_RUNNER) pathRunner: AbPathRunnerFn | null,
    @Optional() @Inject(ABI_COMMERCIAL_OUTCOME_DETECTOR) commercialOutcomeDetector: AbCommercialOutcomeDetectorFn | null,
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
        if (!c.hasProof) {count++;}
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
    if (total === 0) {return 0;}
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
    const bMetrics = this.aggregateMetrics(baseline);
    const vMetrics = this.aggregateMetrics(variant);
    for (const crit of R_CRITERIA) {
      const bScore = this.projectRScore(crit.name, bMetrics, baseline.length);
      const vScore = this.projectRScore(crit.name, vMetrics, variant.length);
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
      if (d.direction === 'improved') {improved++;}
      else if (d.direction === 'regressed') {regressed++;}
      else {unchanged++;}
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
  private aggregateMetrics(
    records: AbHarnessRecord[],
  ): {
    successRate: number;
    avgLatencyMs: number;
    avgTokens: number;
    hallucinationRate: number;
    conversionRate: number;
    satisfactionRate: number;
  } {
    const latencies: number[] = [];
    const tokens: number[] = [];
    let successCount = 0;
    let claimTotal = 0;
    let claimNoProof = 0;
    let conversionCount = 0;
    let satisfactionCount = 0;
    let outcomeCount = 0;
    for (const r of records) {
      latencies.push(r.latencyMs);
      tokens.push(r.tokensUsed);
      if (r.success) {successCount++;}
      for (const c of r.claims) {
        claimTotal++;
        if (!c.hasProof) {claimNoProof++;}
      }
      if (r.commercialOutcome) {
        outcomeCount++;
        if (r.commercialOutcome.conversionSignal) {conversionCount++;}
        if (r.commercialOutcome.satisfactionSignal === true) {satisfactionCount++;}
      }
    }
    return {
      successRate: ratio(successCount, records.length),
      avgLatencyMs: avg(latencies),
      avgTokens: avg(tokens),
      hallucinationRate: ratio(claimNoProof, claimTotal),
      conversionRate: ratio(conversionCount, outcomeCount),
      satisfactionRate: ratio(satisfactionCount, outcomeCount),
    };
  }
  private projectRScore(
    criterion: AbRCriterionName,
    m: ReturnType<AbiAbHarnessService['aggregateMetrics']>,
    _sampleCount: number,
  ): number {
    const s = m.successRate;
    const hRate = m.hallucinationRate;
    const cRate = m.conversionRate;
    const satRate = m.satisfactionRate;
    const byCriterion: Record<AbRCriterionName, () => number> = {
      R1: () => cRate * 0.6 + s * 0.4,
      R2: () => s * 0.8 + (1 - hRate) * 0.2,
      R3: () => s * 0.5 + satRate * 0.5,
      R4: () => (1 - hRate) * 0.7 + satRate * 0.3,
      R5: () => satRate * 0.7 + s * 0.3,
      R6: () => s * 0.6 + (1 - hRate) * 0.4,
      R7: () => s * 0.5 + cRate * 0.5,
      R8: () => satRate * 0.6 + (1 - hRate) * 0.4,
      R9: () => satRate * 0.5 + cRate * 0.5,
      R10: () => (1 - hRate) * 0.8 + cRate * 0.2,
      R11: () => s * 0.5 + satRate * 0.5,
      R12: () => satRate * 0.6 + cRate * 0.4,
      R13: () => satRate * 0.5 + s * 0.5,
      R14: () => s * 0.7 + (1 - hRate) * 0.3,
      R15: () => satRate * 0.6 + cRate * 0.4,
      R16: () => satRate * 0.7 + s * 0.3,
      R17: () => s * 0.6 + satRate * 0.4,
      R18: () => (1 - hRate) * 0.5 + satRate * 0.5,
      R19: () => cRate * 0.6 + satRate * 0.4,
      R20: () => satRate * 0.7 + s * 0.3,
      R21: () => cRate * 0.5 + s * 0.5,
      R22: () => cRate * 0.7 + satRate * 0.3,
      R23: () => cRate * 0.6 + (1 - hRate) * 0.4,
      R24: () => (1 - hRate) * 0.7 + s * 0.3,
      R25: () => s * 0.6 + cRate * 0.4,
      R26: () => s * 0.5 + (1 - hRate) * 0.5,
      R27: () => satRate * 0.5 + cRate * 0.5,
      R28: () => cRate * 0.6 + satRate * 0.4,
      R29: () => s * 0.5 + satRate * 0.5,
      R30: () => satRate * 0.6 + cRate * 0.4,
      R31: () => cRate * 0.5 + satRate * 0.5,
      R32: () => s * 0.6 + cRate * 0.4,
      R33: () => cRate * 0.5 + s * 0.5,
      R34: () => satRate * 0.5 + cRate * 0.5,
      R35: () => s * 0.7 + (1 - hRate) * 0.3,
      R36: () => s * 0.5 + satRate * 0.5,
      R37: () => (1 - hRate) * 0.6 + s * 0.4,
      R38: () => satRate * 0.6 + s * 0.4,
    };
    const fn = byCriterion[criterion];
    if (!fn) {return 0;}
    return clamp01(fn());
  }
}
