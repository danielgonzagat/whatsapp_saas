import { Injectable, Logger } from '@nestjs/common';
import type { ScaleVsAbandon } from './types';
import { clamp } from '../../common/math';

interface ScaleVsAbandonInput {
  readonly campaignId: string;
  readonly workspaceId: string;
  readonly totalSpend: number;
  readonly totalRevenue: number;
  readonly conversionCount: number;
  readonly avgCostPerConversion: number;
  readonly avgRevenuePerConversion: number;
  readonly daysRunning: number;
  readonly trendDirection: 'up' | 'stable' | 'down';
  readonly marketSize: number;
}

const SCALE_ROI_THRESHOLD = 1.5;
const ABANDON_ROI_THRESHOLD = 0.7;
const MIN_DAYS_FOR_DECISION = 3;
const MIN_CONVERSIONS_FOR_SCALE = 5;

@Injectable()
export class ScaleVsAbandonAdvisorService {
  private readonly logger = new Logger(ScaleVsAbandonAdvisorService.name);

  advise(input: ScaleVsAbandonInput): ScaleVsAbandon {
    const roi = input.totalSpend > 0
      ? input.totalRevenue / input.totalSpend
      : 0;

    if (input.totalSpend === 0 && input.conversionCount === 0) {
      return this.buildResult(input, 'hold', 0.3, roi);
    }

    if (input.daysRunning < MIN_DAYS_FOR_DECISION) {
      return this.buildResult(
        input,
        'hold',
        0.4,
        roi,
      );
    }

    const { decision, confidence } = this.evaluate(input, roi);
    return this.buildResult(input, decision, confidence, roi);
  }

  private evaluate(
    input: ScaleVsAbandonInput,
    roi: number,
  ): { decision: 'scale' | 'hold' | 'abandon'; confidence: number } {
    if (roi >= SCALE_ROI_THRESHOLD && input.conversionCount >= MIN_CONVERSIONS_FOR_SCALE) {
      const trendConfidence = input.trendDirection === 'up' ? 0.9 : input.trendDirection === 'stable' ? 0.75 : 0.55;
      return { decision: 'scale', confidence: trendConfidence };
    }

    if (roi < ABANDON_ROI_THRESHOLD && input.daysRunning >= 7) {
      const trendConfidence = input.trendDirection === 'down' ? 0.9 : 0.7;
      return { decision: 'abandon', confidence: trendConfidence };
    }

    if (roi < ABANDON_ROI_THRESHOLD && input.trendDirection === 'down') {
      return { decision: 'abandon', confidence: 0.65 };
    }

    const holdConfidence = clamp(0.4 + (roi - ABANDON_ROI_THRESHOLD) * 0.5, 0.3, 0.7);
    return { decision: 'hold', confidence: holdConfidence };
  }

  private buildResult(
    input: ScaleVsAbandonInput,
    decision: 'scale' | 'hold' | 'abandon',
    confidence: number,
    roi: number,
  ): ScaleVsAbandon {
    const projectedRevenue = input.totalRevenue > 0 && input.daysRunning > 0
      ? Math.round((input.totalRevenue / input.daysRunning) * 30 * 100) / 100
      : 0;

    const projectedCost = input.totalSpend > 0 && input.daysRunning > 0
      ? Math.round((input.totalSpend / input.daysRunning) * 30 * 100) / 100
      : 0;

    const breakEvenDays = input.avgRevenuePerConversion > 0 && input.totalSpend > 0
      ? Math.ceil(input.totalSpend / (input.avgRevenuePerConversion * Math.max(input.conversionCount, 1) / Math.max(input.daysRunning, 1)))
      : 0;

    const reason = this.buildReason(decision, input, roi);

    this.logger.debug(
      `Scale vs Abandon for ${input.campaignId}: ${decision} (roi=${roi.toFixed(2)}, conf=${confidence.toFixed(2)})`,
    );

    return {
      campaignId: input.campaignId,
      workspaceId: input.workspaceId,
      decision,
      confidence: Math.round(confidence * 1000) / 1000,
      reason,
      projectedRevenue,
      projectedCost,
      breakEvenDays,
      decidedAt: new Date().toISOString(),
    };
  }

  private buildReason(
    decision: 'scale' | 'hold' | 'abandon',
    input: ScaleVsAbandonInput,
    roi: number,
  ): string {
    if (decision === 'scale') {
      return `Campaign shows strong ROI (${roi.toFixed(2)}x) with ${input.conversionCount} conversions. ${input.trendDirection === 'up' ? 'Upward trend supports scaling.' : 'Recommend increasing budget cautiously.'}`;
    }
    if (decision === 'abandon') {
      return `Campaign ROI (${roi.toFixed(2)}x) is below threshold after ${input.daysRunning} days with ${input.conversionCount} conversions. Recommend pausing and reallocating budget.`;
    }
    if (input.daysRunning < MIN_DAYS_FOR_DECISION) {
      return `Insufficient data: only ${input.daysRunning} days running. Need at least ${MIN_DAYS_FOR_DECISION} days for a reliable decision.`;
    }
    return `Campaign ROI (${roi.toFixed(2)}x) is in the uncertain zone. Continue monitoring for ${Math.max(0, 7 - input.daysRunning)} more days before deciding.`;
  }
}
