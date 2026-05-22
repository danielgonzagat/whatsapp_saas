import { Injectable, Logger } from '@nestjs/common';
import type { BudgetProtection } from './types';

interface BudgetProtectionInput {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly dailyBudgetLimit: number;
  readonly currentDailySpend: number;
  readonly stopLossThreshold: number;
  readonly totalConversions: number;
  readonly totalCost: number;
}

const WARNING_RATIO = 0.8;
const COST_PER_RESULT_BURNOUT_MULTIPLIER = 3;

@Injectable()
export class BudgetProtectionService {
  private readonly logger = new Logger(BudgetProtectionService.name);

  evaluate(input: BudgetProtectionInput): BudgetProtection {
    const currentLoss = input.totalConversions === 0
      ? input.totalCost
      : Math.max(0, input.totalCost - input.totalConversions * (input.totalCost / Math.max(input.totalConversions, 1)));

    const adjustedLoss = input.totalConversions === 0 ? input.totalCost : currentLoss;

    if (adjustedLoss >= input.stopLossThreshold) {
      return this.buildResult(input, 'stopped', adjustedLoss);
    }

    if (input.currentDailySpend >= input.dailyBudgetLimit * WARNING_RATIO) {
      return this.buildResult(input, 'warning', adjustedLoss);
    }

    if (input.totalConversions === 0 && input.totalCost > 0) {
      const costPerResult = input.totalCost;
      if (costPerResult * COST_PER_RESULT_BURNOUT_MULTIPLIER > input.stopLossThreshold) {
        return this.buildResult(input, 'warning', adjustedLoss);
      }
    }

    return this.buildResult(input, 'safe', adjustedLoss);
  }

  private buildResult(
    input: BudgetProtectionInput,
    status: 'safe' | 'warning' | 'stopped',
    currentLoss: number,
  ): BudgetProtection {
    const recommendation = this.buildRecommendation(status, input);
    const roundedLoss = Math.round(currentLoss * 100) / 100;

    this.logger.debug(
      `Budget protection for ${input.campaignId}: ${status} (loss=${roundedLoss})`,
    );

    return {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      dailyBudgetLimit: input.dailyBudgetLimit,
      currentDailySpend: input.currentDailySpend,
      stopLossThreshold: input.stopLossThreshold,
      currentLoss: roundedLoss,
      protectionStatus: status,
      recommendation,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private buildRecommendation(
    status: 'safe' | 'warning' | 'stopped',
    input: BudgetProtectionInput,
  ): string {
    if (status === 'stopped') {
      return `CRITICAL: Stop-loss threshold of ${input.stopLossThreshold} reached. Campaign should be paused immediately. Review all targeting, creatives, and offer alignment before resuming.`;
    }
    if (status === 'warning') {
      const pctUsed = ((input.currentDailySpend / input.dailyBudgetLimit) * 100).toFixed(0);
      return `WARNING: ${pctUsed}% of daily budget consumed. Reduce spend velocity or adjust bids. Review performance metrics before scaling further.`;
    }
    return 'Budget is within safe limits. Continue monitoring spend velocity.';
  }
}
