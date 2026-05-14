import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TrafficWaste } from './types';

interface TrafficWasteInput {
  readonly campaignId: string;
  readonly workspaceId: string;
  readonly totalSpend: number;
  readonly convertingSpend: number;
  readonly segments: readonly SegmentPerformance[];
}

interface SegmentPerformance {
  readonly segmentId: string;
  readonly spend: number;
  readonly conversions: number;
  readonly conversionRate: number;
}

const WASTE_HIGH_THRESHOLD = 0.6;
const WASTE_MODERATE_THRESHOLD = 0.3;
const MIN_SPEND_FOR_SEGMENT = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

@Injectable()
export class TrafficWasteDetectorService {
  private readonly logger = new Logger(TrafficWasteDetectorService.name);

  detect(input: TrafficWasteInput): TrafficWaste | null {
    if (input.totalSpend <= 0) {
      return null;
    }

    const wastedSpend = Math.max(0, input.totalSpend - input.convertingSpend);
    const wasteScore = clamp(wastedSpend / input.totalSpend, 0, 1);

    const wastefulSegments = input.segments
      .filter((s) => s.conversions === 0 && s.spend >= MIN_SPEND_FOR_SEGMENT)
      .map((s) => s.segmentId);

    const rootCause = this.diagnoseRootCause(wasteScore, wastefulSegments, input.segments);
    const recommendation = this.buildRecommendation(wasteScore, wastefulSegments);

    this.logger.debug(
      `Traffic waste for campaign ${input.campaignId}: ${wasteScore.toFixed(3)}`,
    );

    return {
      id: `tw_${randomUUID()}`,
      campaignId: input.campaignId,
      workspaceId: input.workspaceId,
      wasteScore: Math.round(wasteScore * 1000) / 1000,
      wastedSpend: Math.round(wastedSpend * 100) / 100,
      wastefulSegments,
      rootCause,
      recommendation,
      detectedAt: new Date().toISOString(),
    };
  }

  private diagnoseRootCause(
    wasteScore: number,
    wastefulSegments: readonly string[],
    segments: readonly SegmentPerformance[],
  ): string {
    if (wastefulSegments.length > 0) {
      return `Irrelevant targeting: ${wastefulSegments.length} segment(s) with zero conversions account for wasted spend.`;
    }
    if (wasteScore >= WASTE_HIGH_THRESHOLD) {
      return 'High overall waste: converting spend is too low relative to total spend. Creative or offer may be misaligned.';
    }
    if (wasteScore >= WASTE_MODERATE_THRESHOLD) {
      return 'Moderate waste detected: some segments are underperforming. Consider refinement.';
    }
    const poorSegments = segments.filter((s) => s.conversionRate < 0.01 && s.spend > 0);
    if (poorSegments.length > 0) {
      return `${poorSegments.length} segment(s) have very low conversion rates despite spend.`;
    }
    return 'Traffic efficiency is within acceptable range.';
  }

  private buildRecommendation(
    wasteScore: number,
    wastefulSegments: readonly string[],
  ): string {
    if (wastefulSegments.length > 0) {
      return `Pause or exclude ${wastefulSegments.length} non-converting segment(s) immediately. Reallocate budget to converting audiences.`;
    }
    if (wasteScore >= WASTE_HIGH_THRESHOLD) {
      return 'Critical: review creative, landing page, and audience targeting. Consider pausing campaign until fixed.';
    }
    if (wasteScore >= WASTE_MODERATE_THRESHOLD) {
      return 'Monitor closely. Test new creatives and refine audience segments.';
    }
    return 'Campaign is running efficiently. Continue monitoring.';
  }
}
