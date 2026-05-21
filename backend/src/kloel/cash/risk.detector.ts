import { Injectable } from '@nestjs/common';
import type { CashPosition, RiskDetection, RiskInput, RiskLevel, RunwayCalculation, VolatilityTracking } from './types';

/**
 * CASH-005 — RiskDetector.
 *
 * Early warning system for cash risk. Analyzes cash position, runway,
 * volatility, receivables, and payables to detect risk levels from
 * 'none' to 'critical'. Each trigger contributes to the overall risk level.
 */
@Injectable()
export class RiskDetector {
  private static readonly RUNWAY_CRITICAL_DAYS = 14;
  private static readonly RUNWAY_HIGH_DAYS = 30;
  private static readonly RUNWAY_MEDIUM_DAYS = 60;
  private static readonly TREND_CRITICAL_PCT = -30;
  private static readonly TREND_HIGH_PCT = -15;
  private static readonly TREND_MEDIUM_PCT = -5;
  private static readonly VOLATILITY_HIGH = 0.3;
  private static readonly VOLATILITY_MEDIUM = 0.15;

  public detect(input: RiskInput): RiskDetection {
    const triggers: string[] = [];
    let maxLevel: RiskLevel = 'none';

    const rt = this.checkRunway(input.runway, triggers, maxLevel);
    maxLevel = this.worseLevel(maxLevel, rt);

    const tt = this.checkTrend(input.position, triggers, maxLevel);
    maxLevel = this.worseLevel(maxLevel, tt);

    const vt = this.checkVolatility(input.volatility, triggers, maxLevel);
    maxLevel = this.worseLevel(maxLevel, vt);

    const ct = this.checkCoverage(input, triggers, maxLevel);
    maxLevel = this.worseLevel(maxLevel, ct);

    return {
      workspaceId: input.position.workspaceId,
      riskDetected: maxLevel !== 'none',
      riskLevel: maxLevel,
      triggers,
      detectedAt: new Date().toISOString(),
    };
  }

  public detectBatch(
    workspaceId: string,
    scenarios: readonly RiskInput[],
  ): readonly RiskDetection[] {
    return scenarios.map((s) => {
      const d = this.detect(s);
      return { ...d, workspaceId };
    });
  }

  private checkRunway(
    runway: RunwayCalculation,
    triggers: string[],
    _currentLevel: RiskLevel,
  ): RiskLevel {
    if (runway.runwayDays <= RiskDetector.RUNWAY_CRITICAL_DAYS) {
      triggers.push(`runway_critical_${runway.runwayDays.toFixed(1)}d`);
      return 'critical';
    }
    if (runway.runwayDays <= RiskDetector.RUNWAY_HIGH_DAYS) {
      triggers.push(`runway_high_${runway.runwayDays.toFixed(1)}d`);
      return 'high';
    }
    if (runway.runwayDays <= RiskDetector.RUNWAY_MEDIUM_DAYS) {
      triggers.push(`runway_medium_${runway.runwayDays.toFixed(1)}d`);
      return 'medium';
    }
    if (Number.isFinite(runway.runwayDays) && runway.marginOfSafety < 1.0) {
      triggers.push(`margin_of_safety_below_1x`);
      return 'low';
    }
    return 'none';
  }

  private checkTrend(
    position: CashPosition,
    triggers: string[],
    _currentLevel: RiskLevel,
  ): RiskLevel {
    if (position.trend30d <= RiskDetector.TREND_CRITICAL_PCT) {
      triggers.push(`trend_30d_critical_${position.trend30d.toFixed(1)}pct`);
      return 'critical';
    }
    if (position.trend14d <= RiskDetector.TREND_HIGH_PCT) {
      triggers.push(`trend_14d_high_${position.trend14d.toFixed(1)}pct`);
      return 'high';
    }
    if (position.trend7d <= RiskDetector.TREND_MEDIUM_PCT) {
      triggers.push(`trend_7d_medium_${position.trend7d.toFixed(1)}pct`);
      return 'medium';
    }
    if (
      position.currentBalanceCents <= 0n &&
      position.projectedBalance30d <= 0n
    ) {
      triggers.push('negative_balance_and_projection');
      return 'critical';
    }
    return 'none';
  }

  private checkVolatility(
    volatility: VolatilityTracking,
    triggers: string[],
    _currentLevel: RiskLevel,
  ): RiskLevel {
    if (volatility.dailyVolatility > RiskDetector.VOLATILITY_HIGH && volatility.trend === 'increasing') {
      triggers.push(`volatility_extreme_${(volatility.dailyVolatility * 100).toFixed(1)}pct_trend_${volatility.trend}`);
      return 'high';
    }
    if (volatility.dailyVolatility > RiskDetector.VOLATILITY_MEDIUM) {
      triggers.push(`volatility_elevated_${(volatility.dailyVolatility * 100).toFixed(1)}pct`);
      return 'medium';
    }
    return 'none';
  }

  private checkCoverage(
    input: RiskInput,
    triggers: string[],
    _currentLevel: RiskLevel,
  ): RiskLevel {
    const net30d = input.receivables.dueNext30d - input.payables.dueNext30d;
    if (net30d < 0n && input.position.currentBalanceCents + net30d < 0n) {
      triggers.push('coverage_30d_negative_even_with_balance');
      return 'high';
    }
    if (input.receivables.dueNext7d === 0n && input.position.currentBalanceCents < input.payables.dueNext7d) {
      triggers.push('no_receivables_7d_payables_exceed_balance');
      return 'medium';
    }
    return 'none';
  }

  private worseLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
    const order: Record<RiskLevel, number> = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      none: 0,
    };
    return order[a] >= order[b] ? a : b;
  }
}
