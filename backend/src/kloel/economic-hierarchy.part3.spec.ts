import { attributeHierarchy, type HierarchyDecision, type HierarchyLevel } from './economic-hierarchy';

describe('economic-hierarchy', () => {
  const h = (overrides: Partial<HierarchyDecision> = {}): HierarchyDecision => ({
    type: 'unknown',
    chosen: 'unknown',
    context: {},
    ...overrides,
  });

  describe('rule ordering', () => {
    it('R1 (human_transfer ux) fires before R9 (learning) when both applicable', () => {
      const result = attributeHierarchy(
        h({
          type: 'human_transfer',
          chosen: 'transfer_now',
          context: { concept: 'trust_objection', confidence: 0.3, baselineConfidence: 0.3 },
        }),
      );
      expect(result.level).toBe('ux');
    });

    it('R4 (ceiling ux) fires before R8 (escalation conversion) when both applicable', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'baixa',
          context: {
            brainAggressiveness: 'alta',
            aggressivenessCeiling: 'baixa',
            concept: 'imminent_purchase',
          },
        }),
      );
      expect(result.level).toBe('ux');
    });

    it('R10 (refund legitimacy compliance) fires before conversion rules', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concept: 'defective_product', repliedRate: 0.9, churnRisk: 0.1 },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/before every conversion attempt/);
    });

    it('R11 (churn retention) fires before R8 (escalation conversion) when churn risk present', () => {
      const result = attributeHierarchy(
        h({
          type: 'churn_signal',
          chosen: 'retention_offer',
          context: { churnRisk: 0.8, concept: 'imminent_purchase' },
        }),
      );
      expect(result.level).toBe('retention');
    });

    it('R12 (anti-remorse retention) fires before R7 (top_seller conversion) even with high replied rate', () => {
      const result = attributeHierarchy(
        h({
          type: 'buyer_remorse',
          chosen: 'nurture_sequence',
          context: { daysSincePurchase: 2, repliedRate: 0.9 },
        }),
      );
      expect(result.level).toBe('retention');
    });

    it('R13 (post-sale satisfaction) blocks conversion even when all conversion signals are strong', () => {
      const result = attributeHierarchy(
        h({
          type: 'post_sale_offer',
          chosen: 'cross_sell',
          context: { nps: 2, concept: 'imminent_purchase', repliedRate: 0.9 },
        }),
      );
      expect(result.level).toBe('retention');
    });

    it('post-sale retention does NOT block legitimate margin decisions (R2)', () => {
      const result = attributeHierarchy(
        h({
          type: 'apply_discount',
          chosen: 'coupon_10',
          context: { discountPercent: 10, channelMaxDiscount: 15, marginRemaining: 30, churnRisk: 0.9 },
        }),
      );
      expect(result.level).toBe('margin');
    });
  });
});
