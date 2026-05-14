import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DiscoveryLoopResult } from './types';

interface DiscoveryInput {
  readonly workspaceId: string;
  readonly signals: readonly AffilSignal[];
  readonly context: DiscoveryContext;
}

interface AffilSignal {
  readonly signalType: 'offer_quality' | 'producer_trust' | 'audience_fit' | 'angle_fatigue' | 'traffic_waste' | 'budget_risk' | 'account_risk' | 'commission_change';
  readonly entityId: string;
  readonly currentValue: number;
  readonly baselineValue: number;
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly occurredAt: string;
}

interface DiscoveryContext {
  readonly activeOffers: number;
  readonly activeCampaigns: number;
  readonly monthlyRevenue: number;
  readonly topPerformingOfferId: string | null;
  readonly worstPerformingOfferId: string | null;
}

interface DiscoveryPattern {
  readonly patternId: string;
  readonly signalTypes: readonly string[];
  readonly condition: (signals: readonly AffilSignal[], context: DiscoveryContext) => boolean;
  readonly generateInsight: (signals: readonly AffilSignal[], context: DiscoveryContext) => DiscoveryInsight;
}

interface DiscoveryInsight {
  readonly headline: string;
  readonly body: string;
  readonly actionableRecommendation: string;
  readonly confidence: number;
}

const DISCOVERY_PATTERNS: readonly DiscoveryPattern[] = [
  {
    patternId: 'declining_offer_quality',
    signalTypes: ['offer_quality'],
    condition: (signals, _ctx) =>
      signals.some(
        (s) =>
          s.signalType === 'offer_quality' &&
          s.trend === 'declining' &&
          s.currentValue < s.baselineValue * 0.85,
      ),
    generateInsight: (signals, _ctx) => {
      const offerSignals = signals.filter((s) => s.signalType === 'offer_quality');
      const count = offerSignals.length;
      return {
        headline: `${count} offer(s) showing declining quality scores`,
        body: `Offer quality is declining for ${count} offer(s). This may indicate market saturation, increased competition, or product fatigue. Historical baseline was ${offerSignals[0]?.baselineValue.toFixed(2)}; current score is ${offerSignals[0]?.currentValue.toFixed(2)}.`,
        actionableRecommendation: 'Re-evaluate offer positioning. Consider refreshing creatives, adjusting pricing, or testing new audience segments before quality degrades further.',
        confidence: 0.75,
      };
    },
  },
  {
    patternId: 'producer_trust_erosion',
    signalTypes: ['producer_trust'],
    condition: (signals, _ctx) =>
      signals.some(
        (s) =>
          s.signalType === 'producer_trust' &&
          s.currentValue < 0.4,
      ),
    generateInsight: (signals, _ctx) => {
      const trustSignals = signals.filter((s) => s.signalType === 'producer_trust');
      return {
        headline: 'Producer trust score critically low',
        body: `Producer trust has fallen below safety threshold (current: ${trustSignals[0]?.currentValue.toFixed(2)}). This signals risk of payment delays, poor communication, or declining product quality.`,
        actionableRecommendation: 'Immediately review payment history and communication patterns. Prepare alternative producers as backup. Consider pausing new campaigns until trust is restored.',
        confidence: 0.85,
      };
    },
  },
  {
    patternId: 'audience_misalignment',
    signalTypes: ['audience_fit'],
    condition: (signals, _ctx) =>
      signals.some(
        (s) =>
          s.signalType === 'audience_fit' &&
          s.currentValue < 0.35 &&
          s.trend === 'declining',
      ),
    generateInsight: (signals, _ctx) => {
      const fitSignals = signals.filter((s) => s.signalType === 'audience_fit');
      return {
        headline: 'Critical audience-offer misalignment detected',
        body: `Audience fit score has dropped to ${fitSignals[0]?.currentValue.toFixed(2)} with declining trend. The current audience is no longer well-matched to the offer, wasting ad spend.`,
        actionableRecommendation: 'Refresh audience targeting immediately. Test lookalike audiences based on converting segments. Consider offer switch if audience cannot be realigned.',
        confidence: 0.8,
      };
    },
  },
  {
    patternId: 'angle_fatigue_warning',
    signalTypes: ['angle_fatigue'],
    condition: (signals, _ctx) =>
      signals.some(
        (s) =>
          s.signalType === 'angle_fatigue' &&
          s.currentValue > 0.5,
      ),
    generateInsight: (signals, _ctx) => {
      const fatigueSignals = signals.filter((s) => s.signalType === 'angle_fatigue');
      return {
        headline: `Angle fatigue detected across ${fatigueSignals.length} angle(s)`,
        body: `Marketing angles are showing fatigue (score > 0.5). Continuing with fatigued angles will lead to declining CTR, higher CPAs, and wasted budget.`,
        actionableRecommendation: 'Rotate creative angles immediately. Test 3-5 new hooks and angles. Archive fatigued angles for at least 30 days before retesting.',
        confidence: 0.7,
      };
    },
  },
  {
    patternId: 'budget_inefficiency',
    signalTypes: ['traffic_waste', 'budget_risk'],
    condition: (signals, _ctx) =>
      signals.some(
        (s) =>
          (s.signalType === 'traffic_waste' && s.currentValue > 0.5) ||
          (s.signalType === 'budget_risk' && s.trend === 'declining'),
      ),
    generateInsight: (signals, context) => {
      const wasteSignals = signals.filter((s) => s.signalType === 'traffic_waste');
      const totalWaste = wasteSignals.reduce((sum, s) => sum + s.currentValue, 0);
      return {
        headline: 'Significant budget inefficiency detected',
        body: `Traffic waste and budget risk signals indicate ${context.activeCampaigns} campaign(s) may be burning budget inefficiently. Cumulative waste signal: ${totalWaste.toFixed(2)}.`,
        actionableRecommendation: 'Audit all active campaigns. Pause underperforming segments. Reallocate budget to top-performing offer and audiences. Implement stricter stop-loss rules.',
        confidence: 0.75,
      };
    },
  },
  {
    patternId: 'commission_optimization_opportunity',
    signalTypes: ['commission_change'],
    condition: (signals, _ctx) =>
      signals.some(
        (s) =>
          s.signalType === 'commission_change' &&
          s.currentValue > s.baselineValue * 1.2,
      ),
    generateInsight: (signals, _ctx) => {
      const commSignals = signals.filter((s) => s.signalType === 'commission_change');
      return {
        headline: 'Commission improvement opportunity identified',
        body: `Commission rates have improved for ${commSignals.length} offer(s). Current effective rate is ${commSignals[0]?.currentValue.toFixed(2)} vs baseline ${commSignals[0]?.baselineValue.toFixed(2)}. This represents a significant earnings upside.`,
        actionableRecommendation: 'Prioritize campaigns for higher-commission offers. Recalculate expected monthly earnings with new rates. Consider switching budget from lower-commission offers.',
        confidence: 0.7,
      };
    },
  },
  {
    patternId: 'account_risk_escalation',
    signalTypes: ['account_risk'],
    condition: (signals, _ctx) =>
      signals.some(
        (s) =>
          s.signalType === 'account_risk' &&
          s.currentValue > 0.6,
      ),
    generateInsight: (signals, _ctx) => {
      return {
        headline: 'Ad account risk level is critical',
        body: `Account risk score has exceeded safety threshold (${signals[0]?.currentValue.toFixed(2)}). This indicates elevated probability of policy enforcement, ad rejections, or account restriction.`,
        actionableRecommendation: 'Pause all non-essential campaigns. Review all active ads for policy compliance. Resolve any outstanding policy violations. Wait for account health to recover before resuming.',
        confidence: 0.9,
      };
    },
  },
  {
    patternId: 'portfolio_imbalance',
    signalTypes: ['offer_quality', 'audience_fit'],
    condition: (_signals, context) =>
      context.activeOffers > 1 &&
      context.worstPerformingOfferId !== null &&
      context.topPerformingOfferId !== context.worstPerformingOfferId,
    generateInsight: (_signals, context) => {
      return {
        headline: 'Offer portfolio imbalance detected',
        body: `You have ${context.activeOffers} active offers but performance is concentrated. The worst-performing offer is dragging down overall ROI.`,
        actionableRecommendation: `Consider pausing the worst-performing offer (${context.worstPerformingOfferId}) and reallocating budget to the top performer (${context.topPerformingOfferId}). A concentrated portfolio often outperforms a scattered one.`,
        confidence: 0.65,
      };
    },
  },
];

@Injectable()
export class AffilDiscoveryLoopService {
  private readonly logger = new Logger(AffilDiscoveryLoopService.name);

  discover(input: DiscoveryInput): readonly DiscoveryLoopResult[] {
    if (input.signals.length === 0) {
      return [];
    }

    const results: DiscoveryLoopResult[] = [];

    for (const pattern of DISCOVERY_PATTERNS) {
      const relevantSignals = input.signals.filter(
        (s) => pattern.signalTypes.includes(s.signalType),
      );

      if (relevantSignals.length === 0) continue;

      if (pattern.condition(relevantSignals, input.context)) {
        const insight = pattern.generateInsight(relevantSignals, input.context);

        const result: DiscoveryLoopResult = {
          id: `disc_${randomUUID()}`,
          workspaceId: input.workspaceId,
          hypothesisId: `hyp_${pattern.patternId}_${randomUUID()}`,
          narrativeId: `nar_${pattern.patternId}_${randomUUID()}`,
          insight: `${insight.headline}. ${insight.body}`,
          actionableRecommendation: insight.actionableRecommendation,
          confidence: Math.round(insight.confidence * 1000) / 1000,
          generatedAt: new Date().toISOString(),
        };

        results.push(result);
        this.logger.debug(
          `Discovery: ${pattern.patternId} for workspace ${input.workspaceId}`,
        );
      }
    }

    if (results.length === 0) {
      this.logger.debug(
        `No discoveries for workspace ${input.workspaceId} with ${input.signals.length} signals`,
      );
    } else {
      this.logger.debug(
        `Generated ${results.length} discoveries for workspace ${input.workspaceId}`,
      );
    }

    return results;
  }

  getPatternCount(): number {
    return DISCOVERY_PATTERNS.length;
  }
}
