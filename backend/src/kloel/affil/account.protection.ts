import { Injectable, Logger } from '@nestjs/common';
import type { AccountProtection } from './types';

interface AccountProtectionInput {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly policyViolations: readonly string[];
  readonly reputationFlags: readonly string[];
  readonly adRejectionRate: number;
  readonly accountAgeDays: number;
  readonly isVerifiedBusiness: boolean;
}

const RISK_HIGH_THRESHOLD = 0.7;
const RISK_MODERATE_THRESHOLD = 0.4;
const NEW_ACCOUNT_DAYS = 30;
const HIGH_REJECTION_RATE = 0.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

@Injectable()
export class AccountProtectionService {
  private readonly logger = new Logger(AccountProtectionService.name);

  evaluate(input: AccountProtectionInput): AccountProtection {
    const violationRisk = Math.min(input.policyViolations.length * 0.25, 1);
    const reputationRisk = Math.min(input.reputationFlags.length * 0.2, 1);
    const rejectionRisk = input.adRejectionRate >= HIGH_REJECTION_RATE ? 0.4 : input.adRejectionRate;
    const newAccountRisk = input.accountAgeDays < NEW_ACCOUNT_DAYS ? 0.3 : 0;
    const verifiedBonus = input.isVerifiedBusiness ? -0.15 : 0;

    const riskScore = clamp(
      violationRisk * 0.35 +
        reputationRisk * 0.25 +
        rejectionRisk * 0.25 +
        newAccountRisk * 0.15 +
        verifiedBonus,
      0,
      1,
    );

    const recommendation = this.determineRecommendation(riskScore, input.policyViolations);

    this.logger.debug(
      `Account ${input.accountId} protection risk: ${riskScore.toFixed(3)} (${recommendation})`,
    );

    return {
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      riskScore: Math.round(riskScore * 1000) / 1000,
      policyViolations: input.policyViolations,
      reputationFlags: input.reputationFlags,
      recommendation,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private determineRecommendation(
    riskScore: number,
    violations: readonly string[],
  ): 'safe' | 'review' | 'pause' | 'stop' {
    if (riskScore >= RISK_HIGH_THRESHOLD || violations.length >= 3) return 'stop';
    if (riskScore >= RISK_MODERATE_THRESHOLD) return 'pause';
    if (violations.length > 0 || riskScore >= 0.2) return 'review';
    return 'safe';
  }

  isAtRisk(protection: AccountProtection): boolean {
    return protection.riskScore >= RISK_MODERATE_THRESHOLD;
  }
}
