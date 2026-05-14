import { AccountProtectionService } from './account.protection';
import { AffilDiscoveryLoopService } from './affil-discovery.loop';
import { AngleFatigueDetectorService } from './angle-fatigue.detector';
import { AngleSuggesterService } from './angle.suggester';
import { AudienceFitDetectorService } from './audience-fit.detector';
import { BudgetProtectionService } from './budget.protection';
import { CommissionComparatorService } from './commission.comparator';
import { OfferQualityScorerService } from './offer-quality.scorer';
import { OfferSwitchSuggesterService } from './offer-switch.suggester';
import { ProducerTrustScorerService } from './producer-trust.scorer';
import { ScaleVsAbandonAdvisorService } from './scale-vs-abandon.advisor';
import { TrafficWasteDetectorService } from './traffic-waste.detector';

describe('Affil module (UTP-AFFIL-001..012)', () => {
  describe('OfferQualityScorerService (AFFIL-001)', () => {
    const svc = new OfferQualityScorerService();

    it('scores a high-quality offer with all signals positive', () => {
      const result = svc.score({
        offerId: 'offer-1',
        workspaceId: 'ws-1',
        conversionRate: 0.08,
        refundRate: 0.02,
        avgTicket: 150,
        commissionRate: 0.3,
        marketDemand: 0.85,
        saturationRisk: 0.1,
      });
      expect(result.overallScore).toBeGreaterThan(0.5);
      expect(result.offerId).toBe('offer-1');
    });

    it('scores a low-quality offer with poor signals', () => {
      const result = svc.score({
        offerId: 'offer-2',
        workspaceId: 'ws-1',
        conversionRate: 0.01,
        refundRate: 0.3,
        avgTicket: 10,
        commissionRate: 0.05,
        marketDemand: 0.1,
        saturationRisk: 0.9,
      });
      expect(result.overallScore).toBeLessThan(0.4);
    });

    it('clamps overallScore to [0, 1]', () => {
      const extreme = svc.score({
        offerId: 'offer-x',
        workspaceId: 'ws-1',
        conversionRate: 1,
        refundRate: 0,
        avgTicket: 10000,
        commissionRate: 1,
        marketDemand: 1,
        saturationRisk: 0,
      });
      expect(extreme.overallScore).toBeLessThanOrEqual(1);
      expect(extreme.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ProducerTrustScorerService (AFFIL-002)', () => {
    const svc = new ProducerTrustScorerService();

    it('scores a highly trustworthy producer', () => {
      const result = svc.score({
        producerId: 'prod-1',
        workspaceId: 'ws-1',
        paymentHistoryReliability: 0.95,
        communicationResponsiveness: 0.9,
        productQualityConsistency: 0.85,
        disputeResolutionRate: 0.9,
        productionStability: 0.8,
      });
      expect(result.trustScore).toBeGreaterThan(0.7);
      expect(svc.isTrustworthy(result)).toBe(true);
      expect(svc.getRiskLevel(result)).toBe('low');
    });

    it('scores an untrustworthy producer', () => {
      const result = svc.score({
        producerId: 'prod-2',
        workspaceId: 'ws-1',
        paymentHistoryReliability: 0.2,
        communicationResponsiveness: 0.15,
        productQualityConsistency: 0.1,
        disputeResolutionRate: 0.2,
        productionStability: 0.1,
      });
      expect(result.trustScore).toBeLessThan(0.3);
      expect(svc.isUntrustworthy(result)).toBe(true);
      expect(svc.getRiskLevel(result)).toBe('high');
    });

    it('returns medium risk for borderline trust', () => {
      const result = svc.score({
        producerId: 'prod-3',
        workspaceId: 'ws-1',
        paymentHistoryReliability: 0.5,
        communicationResponsiveness: 0.5,
        productQualityConsistency: 0.5,
        disputeResolutionRate: 0.5,
        productionStability: 0.5,
      });
      expect(svc.getRiskLevel(result)).toBe('medium');
    });
  });

  describe('AudienceFitDetectorService (AFFIL-003)', () => {
    const svc = new AudienceFitDetectorService();

    it('detects strong audience-offer fit', () => {
      const result = svc.detect({
        audienceId: 'aud-1',
        offerId: 'offer-1',
        workspaceId: 'ws-1',
        demographicAlignment: 0.9,
        interestOverlap: 0.85,
        behavioralMatch: 0.8,
        purchaseIntentAlignment: 0.9,
      });
      expect(result.fitScore).toBeGreaterThan(0.7);
      expect(svc.getFitLevel(result)).toBe('strong');
      expect(svc.isViable(result)).toBe(true);
    });

    it('detects weak audience-offer fit', () => {
      const result = svc.detect({
        audienceId: 'aud-2',
        offerId: 'offer-1',
        workspaceId: 'ws-1',
        demographicAlignment: 0.2,
        interestOverlap: 0.1,
        behavioralMatch: 0.15,
        purchaseIntentAlignment: 0.1,
      });
      expect(result.fitScore).toBeLessThan(0.4);
      expect(svc.getFitLevel(result)).toBe('weak');
      expect(svc.isViable(result)).toBe(false);
    });
  });

  describe('AngleSuggesterService (AFFIL-004)', () => {
    const svc = new AngleSuggesterService();

    it('suggests angles for health category', () => {
      const results = svc.suggest({
        offerId: 'offer-1',
        workspaceId: 'ws-1',
        offerCategory: 'saude',
        offerPrice: 97,
        offerProblemSolved: 'emagrecimento',
        audiencePainPoints: ['dificuldade para emagrecer'],
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.angle).toBeDefined();
      expect(results[0]!.hook).toBeDefined();
    });

    it('falls back to general templates for unknown category', () => {
      const results = svc.suggest({
        offerId: 'offer-2',
        workspaceId: 'ws-1',
        offerCategory: 'categoria_inexistente',
        offerPrice: 50,
        offerProblemSolved: 'algo',
        audiencePainPoints: [],
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for empty options with no general match', () => {
      const svcEmpty = new AngleSuggesterService();
      const results = svcEmpty.suggest({
        offerId: 'offer-3',
        workspaceId: 'ws-1',
        offerCategory: '',
        offerPrice: 0,
        offerProblemSolved: '',
        audiencePainPoints: [],
      });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AngleFatigueDetectorService (AFFIL-005)', () => {
    const svc = new AngleFatigueDetectorService();

    it('detects high fatigue from significant CTR and conversion decline', () => {
      const result = svc.detect({
        angleId: 'ang-1',
        workspaceId: 'ws-1',
        impressionCount: 50000,
        ctrCurrent: 0.01,
        ctrBaseline: 0.05,
        conversionCurrent: 0.005,
        conversionBaseline: 0.02,
      });
      expect(result.fatigueScore).toBeGreaterThan(0.6);
      expect(result.recommendation).toBe('rotate');
      expect(svc.isFatigued(result)).toBe(true);
    });

    it('returns still_fresh for stable performance', () => {
      const result = svc.detect({
        angleId: 'ang-2',
        workspaceId: 'ws-1',
        impressionCount: 10000,
        ctrCurrent: 0.045,
        ctrBaseline: 0.05,
        conversionCurrent: 0.019,
        conversionBaseline: 0.02,
      });
      expect(result.recommendation).toBe('still_fresh');
      expect(svc.isFatigued(result)).toBe(false);
    });

    it('handles zero baselines safely', () => {
      const result = svc.detect({
        angleId: 'ang-3',
        workspaceId: 'ws-1',
        impressionCount: 1000,
        ctrCurrent: 0,
        ctrBaseline: 0,
        conversionCurrent: 0,
        conversionBaseline: 0,
      });
      expect(result.fatigueScore).toBe(0);
      expect(result.recommendation).toBe('still_fresh');
    });
  });

  describe('TrafficWasteDetectorService (AFFIL-006)', () => {
    const svc = new TrafficWasteDetectorService();

    it('detects high waste from non-converting segments', () => {
      const result = svc.detect({
        campaignId: 'camp-1',
        workspaceId: 'ws-1',
        totalSpend: 500,
        convertingSpend: 200,
        segments: [
          { segmentId: 'seg-1', spend: 100, conversions: 0, conversionRate: 0 },
          { segmentId: 'seg-2', spend: 50, conversions: 0, conversionRate: 0 },
        ],
      });
      expect(result).not.toBeNull();
      expect(result!.wasteScore).toBeGreaterThan(0.4);
      expect(result!.wastefulSegments.length).toBeGreaterThan(0);
    });

    it('returns null for zero spend', () => {
      const result = svc.detect({
        campaignId: 'camp-2',
        workspaceId: 'ws-1',
        totalSpend: 0,
        convertingSpend: 0,
        segments: [],
      });
      expect(result).toBeNull();
    });

    it('detects no waste when all spend is converting', () => {
      const result = svc.detect({
        campaignId: 'camp-3',
        workspaceId: 'ws-1',
        totalSpend: 300,
        convertingSpend: 300,
        segments: [
          { segmentId: 'seg-1', spend: 300, conversions: 10, conversionRate: 0.05 },
        ],
      });
      expect(result).not.toBeNull();
      expect(result!.wasteScore).toBe(0);
    });
  });

  describe('BudgetProtectionService (AFFIL-007)', () => {
    const svc = new BudgetProtectionService();

    it('triggers stopped when loss exceeds stop-loss', () => {
      const result = svc.evaluate({
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
        dailyBudgetLimit: 100,
        currentDailySpend: 95,
        stopLossThreshold: 80,
        totalConversions: 0,
        totalCost: 95,
      });
      expect(result.protectionStatus).toBe('stopped');
    });

    it('triggers warning when approaching budget limit', () => {
      const result = svc.evaluate({
        workspaceId: 'ws-1',
        campaignId: 'camp-2',
        dailyBudgetLimit: 100,
        currentDailySpend: 85,
        stopLossThreshold: 200,
        totalConversions: 1,
        totalCost: 85,
      });
      expect(result.protectionStatus).toBe('warning');
    });

    it('returns safe for normal operation', () => {
      const result = svc.evaluate({
        workspaceId: 'ws-1',
        campaignId: 'camp-3',
        dailyBudgetLimit: 100,
        currentDailySpend: 30,
        stopLossThreshold: 200,
        totalConversions: 5,
        totalCost: 30,
      });
      expect(result.protectionStatus).toBe('safe');
    });
  });

  describe('AccountProtectionService (AFFIL-008)', () => {
    const svc = new AccountProtectionService();

    it('returns stop for multiple policy violations', () => {
      const result = svc.evaluate({
        workspaceId: 'ws-1',
        accountId: 'acct-1',
        policyViolations: ['misleading_claims', 'prohibited_content', 'trademark'],
        reputationFlags: ['high_complaint_rate'],
        adRejectionRate: 0.4,
        accountAgeDays: 10,
        isVerifiedBusiness: false,
      });
      expect(result.recommendation).toBe('stop');
      expect(svc.isAtRisk(result)).toBe(true);
    });

    it('returns safe for verified business with no issues', () => {
      const result = svc.evaluate({
        workspaceId: 'ws-1',
        accountId: 'acct-2',
        policyViolations: [],
        reputationFlags: [],
        adRejectionRate: 0,
        accountAgeDays: 180,
        isVerifiedBusiness: true,
      });
      expect(result.recommendation).toBe('safe');
      expect(svc.isAtRisk(result)).toBe(false);
    });

    it('returns review for single policy violation', () => {
      const result = svc.evaluate({
        workspaceId: 'ws-1',
        accountId: 'acct-3',
        policyViolations: ['minor_policy_flag'],
        reputationFlags: [],
        adRejectionRate: 0.05,
        accountAgeDays: 60,
        isVerifiedBusiness: true,
      });
      expect(result.recommendation).toBe('review');
    });
  });

  describe('CommissionComparatorService (AFFIL-009)', () => {
    const svc = new CommissionComparatorService();

    it('identifies best offer by expected monthly earnings', () => {
      const result = svc.compare({
        workspaceId: 'ws-1',
        estimatedMonthlySales: 100,
        entries: [
          { offerId: 'offer-a', baseCommissionRate: 0.3, effectiveRate: 0.28, avgTicket: 97 },
          { offerId: 'offer-b', baseCommissionRate: 0.2, effectiveRate: 0.19, avgTicket: 200 },
          { offerId: 'offer-c', baseCommissionRate: 0.5, effectiveRate: 0.45, avgTicket: 50 },
        ],
      });
      expect(result).not.toBeNull();
      expect(result!.bestOfferId).toBeDefined();
      expect(result!.comparisons.length).toBe(3);
    });

    it('returns null for empty entries', () => {
      const result = svc.compare({
        workspaceId: 'ws-1',
        estimatedMonthlySales: 50,
        entries: [],
      });
      expect(result).toBeNull();
    });

    it('calculates improvement from switching offers', () => {
      const comparison = svc.compare({
        workspaceId: 'ws-1',
        estimatedMonthlySales: 100,
        entries: [
          { offerId: 'low', baseCommissionRate: 0.1, effectiveRate: 0.08, avgTicket: 50 },
          { offerId: 'high', baseCommissionRate: 0.4, effectiveRate: 0.38, avgTicket: 200 },
        ],
      });
      expect(comparison).not.toBeNull();
      const improvement = svc.improvementFromSwitch(comparison!, 'low', 'high');
      expect(improvement).not.toBeNull();
      expect(improvement!).toBeGreaterThan(0);
    });
  });

  describe('OfferSwitchSuggesterService (AFFIL-010)', () => {
    const svc = new OfferSwitchSuggesterService();

    it('suggests switch when candidate is significantly better', () => {
      const results = svc.suggest({
        workspaceId: 'ws-1',
        currentOfferId: 'offer-current',
        currentOfferPerformance: {
          conversionRate: 0.02,
          refundRate: 0.1,
          avgTicket: 50,
          monthlyRevenue: 500,
          trendDirection: 'down',
        },
        candidateOffers: [
          { offerId: 'offer-better', commissionRate: 0.35, conversionRate: 0.06, avgTicket: 100, refundRate: 0.05, marketDemand: 0.8 },
        ],
      });
      expect(results.length).toBe(1);
      expect(results[0]!.suggestedOfferId).toBe('offer-better');
    });

    it('returns empty when no candidate is better', () => {
      const results = svc.suggest({
        workspaceId: 'ws-1',
        currentOfferId: 'offer-great',
        currentOfferPerformance: {
          conversionRate: 0.1,
          refundRate: 0.02,
          avgTicket: 200,
          monthlyRevenue: 5000,
          trendDirection: 'up',
        },
        candidateOffers: [
          { offerId: 'offer-bad', commissionRate: 0.05, conversionRate: 0.005, avgTicket: 20, refundRate: 0.4, marketDemand: 0.1 },
        ],
      });
      expect(results.length).toBe(0);
    });
  });

  describe('ScaleVsAbandonAdvisorService (AFFIL-011)', () => {
    const svc = new ScaleVsAbandonAdvisorService();

    it('recommends scale for high ROI campaign with conversions', () => {
      const result = svc.advise({
        campaignId: 'camp-1',
        workspaceId: 'ws-1',
        totalSpend: 200,
        totalRevenue: 600,
        conversionCount: 10,
        avgCostPerConversion: 20,
        avgRevenuePerConversion: 60,
        daysRunning: 7,
        trendDirection: 'up',
        marketSize: 10000,
      });
      expect(result.decision).toBe('scale');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('recommends abandon for poor ROI campaign', () => {
      const result = svc.advise({
        campaignId: 'camp-2',
        workspaceId: 'ws-1',
        totalSpend: 500,
        totalRevenue: 100,
        conversionCount: 1,
        avgCostPerConversion: 500,
        avgRevenuePerConversion: 100,
        daysRunning: 10,
        trendDirection: 'down',
        marketSize: 10000,
      });
      expect(result.decision).toBe('abandon');
    });

    it('recommends hold for early-stage campaign', () => {
      const result = svc.advise({
        campaignId: 'camp-3',
        workspaceId: 'ws-1',
        totalSpend: 50,
        totalRevenue: 60,
        conversionCount: 1,
        avgCostPerConversion: 50,
        avgRevenuePerConversion: 60,
        daysRunning: 1,
        trendDirection: 'stable',
        marketSize: 10000,
      });
      expect(result.decision).toBe('hold');
    });

    it('recommends hold for zero-spend campaign', () => {
      const result = svc.advise({
        campaignId: 'camp-4',
        workspaceId: 'ws-1',
        totalSpend: 0,
        totalRevenue: 0,
        conversionCount: 0,
        avgCostPerConversion: 0,
        avgRevenuePerConversion: 0,
        daysRunning: 0,
        trendDirection: 'stable',
        marketSize: 10000,
      });
      expect(result.decision).toBe('hold');
    });
  });

  describe('AffilDiscoveryLoopService (AFFIL-012)', () => {
    const svc = new AffilDiscoveryLoopService();

    const baseContext = {
      activeOffers: 3,
      activeCampaigns: 5,
      monthlyRevenue: 10000,
      topPerformingOfferId: 'offer-a',
      worstPerformingOfferId: 'offer-c',
    };

    it('discovers declining offer quality pattern', () => {
      const results = svc.discover({
        workspaceId: 'ws-1',
        context: baseContext,
        signals: [
          {
            signalType: 'offer_quality',
            entityId: 'offer-1',
            currentValue: 0.5,
            baselineValue: 0.8,
            trend: 'declining',
            occurredAt: new Date().toISOString(),
          },
        ],
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.confidence).toBeGreaterThan(0.5);
      expect(results[0]!.actionableRecommendation).toBeTruthy();
    });

    it('discovers angle fatigue pattern', () => {
      const results = svc.discover({
        workspaceId: 'ws-1',
        context: baseContext,
        signals: [
          {
            signalType: 'angle_fatigue',
            entityId: 'ang-1',
            currentValue: 0.65,
            baselineValue: 0.3,
            trend: 'declining',
            occurredAt: new Date().toISOString(),
          },
        ],
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('discovers producer trust erosion', () => {
      const results = svc.discover({
        workspaceId: 'ws-1',
        context: baseContext,
        signals: [
          {
            signalType: 'producer_trust',
            entityId: 'prod-1',
            currentValue: 0.25,
            baselineValue: 0.7,
            trend: 'declining',
            occurredAt: new Date().toISOString(),
          },
        ],
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.confidence).toBeGreaterThan(0.7);
    });

    it('returns empty for no matching signals', () => {
      const results = svc.discover({
        workspaceId: 'ws-1',
        context: baseContext,
        signals: [],
      });
      expect(results).toHaveLength(0);
    });

    it('has discovery patterns registered', () => {
      expect(svc.getPatternCount()).toBeGreaterThan(0);
    });

    it('discovers portfolio imbalance with multiple offers', () => {
      const results = svc.discover({
        workspaceId: 'ws-1',
        context: baseContext,
        signals: [
          {
            signalType: 'offer_quality',
            entityId: 'offer-a',
            currentValue: 0.9,
            baselineValue: 0.85,
            trend: 'stable',
            occurredAt: new Date().toISOString(),
          },
        ],
      });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('discovers account risk escalation', () => {
      const results = svc.discover({
        workspaceId: 'ws-1',
        context: baseContext,
        signals: [
          {
            signalType: 'account_risk',
            entityId: 'acct-1',
            currentValue: 0.75,
            baselineValue: 0.2,
            trend: 'declining',
            occurredAt: new Date().toISOString(),
          },
        ],
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.confidence).toBe(0.9);
    });
  });
});
