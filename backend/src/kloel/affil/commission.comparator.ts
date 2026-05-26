import { Injectable, Logger } from '@nestjs/common';
import type { CommissionComparison, CommissionEntry } from './types';

interface CommissionInput {
  readonly workspaceId: string;
  readonly entries: readonly Omit<CommissionEntry, 'expectedMonthlyEarnings'>[];
  readonly estimatedMonthlySales: number;
}

const DEFAULT_ESTIMATED_SALES = 50;

@Injectable()
export class CommissionComparatorService {
  private readonly logger = new Logger(CommissionComparatorService.name);

  compare(input: CommissionInput): CommissionComparison | null {
    if (input.entries.length === 0) {
      return null;
    }

    const monthlySales = input.estimatedMonthlySales > 0
      ? input.estimatedMonthlySales
      : DEFAULT_ESTIMATED_SALES;

    const comparisons: CommissionEntry[] = input.entries.map((entry) => ({
      ...entry,
      expectedMonthlyEarnings: Math.round(entry.effectiveRate * entry.avgTicket * monthlySales * 100) / 100,
    }));

    const sorted = [...comparisons].sort(
      (a, b) => b.expectedMonthlyEarnings - a.expectedMonthlyEarnings,
    );

    const best = sorted[0]!;

    this.logger.debug(
      `Commission comparison: best offer ${best.offerId} with effective rate ${best.effectiveRate}`,
    );

    return {
      workspaceId: input.workspaceId,
      comparisons,
      bestOfferId: best.offerId,
      bestEffectiveRate: best.effectiveRate,
      evaluatedAt: new Date().toISOString(),
    };
  }

  findBestByRate(comparison: CommissionComparison): CommissionEntry {
    const sorted = [...comparison.comparisons].sort(
      (a, b) => b.effectiveRate - a.effectiveRate,
    );
    return sorted[0]!;
  }

  improvementFromSwitch(
    comparison: CommissionComparison,
    currentOfferId: string,
    targetOfferId: string,
  ): number | null {
    const current = comparison.comparisons.find((c) => c.offerId === currentOfferId);
    const target = comparison.comparisons.find((c) => c.offerId === targetOfferId);
    if (!current || !target || current.expectedMonthlyEarnings === 0) {return null;}
    return Math.round(
      ((target.expectedMonthlyEarnings - current.expectedMonthlyEarnings) / current.expectedMonthlyEarnings) * 1000,
    ) / 1000;
  }
}
