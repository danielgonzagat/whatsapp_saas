import { attributeHierarchy } from './economic-hierarchy';

type HierarchyDecision = Parameters<typeof attributeHierarchy>[0];

describe('economic-hierarchy', () => {
  const h = (overrides: Partial<HierarchyDecision> = {}): HierarchyDecision => ({
    type: 'unknown',
    chosen: 'unknown',
    context: {},
    ...overrides,
  });

  describe('R1 — human_transfer ux', () => {
    it('trust_objection → ux', () => {
      const result = attributeHierarchy(
        h({
          type: 'human_transfer',
          chosen: 'transfer_now',
          context: { concept: 'trust_objection' },
        }),
      );
      expect(result.level).toBe('ux');
      expect(result.reason).toMatch(/trust_objection/);
    });

    it('fatigue_risk → ux', () => {
      const result = attributeHierarchy(
        h({ type: 'human_transfer', chosen: 'pause_wait', context: { concept: 'fatigue_risk' } }),
      );
      expect(result.level).toBe('ux');
      expect(result.reason).toMatch(/fatigue_risk/);
    });

    it('non-trust/fatigue human_transfer falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'human_transfer', chosen: 'transfer_now', context: { concept: 'other' } }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R2 — discount compliance/margin', () => {
    it('discount over channel max → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'coupon_offer',
          chosen: 'coupon_20',
          context: { discountPercent: 20, channelMaxDiscount: 10, productMargin: 30 },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/exceeds channel maximum/);
    });

    it('discount within bounds, margin positive → margin', () => {
      const result = attributeHierarchy(
        h({
          type: 'apply_discount',
          chosen: 'coupon_10',
          context: { discountPercent: 10, channelMaxDiscount: 15, productMargin: 30 },
        }),
      );
      expect(result.level).toBe('margin');
      expect(result.reason).toMatch(/margin remains positive/);
    });

    it('discount within channel max but zero margin → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'coupon_offer',
          chosen: 'coupon_10',
          context: { discountPercent: 10, channelMaxDiscount: 15, marginRemaining: -5 },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/prohibits loss-making/);
    });

    it('marginRemaining used as alias for productMargin', () => {
      const result = attributeHierarchy(
        h({
          type: 'apply_discount',
          chosen: 'coupon_5',
          context: { discountPercent: 5, channelMaxDiscount: 10, marginRemaining: 20 },
        }),
      );
      expect(result.level).toBe('margin');
    });
  });

  describe('R3 — proactive outbound compliance', () => {
    it('daily limit exceeded → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'proactive_outbound',
          chosen: 'send',
          context: { dailySent: 100, dailyLimit: 100 },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/blocked by compliance ceiling/);
    });

    it('under daily limit → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'proactive_outbound',
          chosen: 'send',
          context: { dailySent: 50, dailyLimit: 100 },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('no limit set → falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'proactive_outbound', chosen: 'send', context: {} }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R10 — refund_request legitimacy → compliance', () => {
    it('defective_product reason → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concept: 'defective_product' },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/defective_product/);
      expect(result.reason).toMatch(/before every conversion attempt/);
    });

    it('not_as_described reason → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concept: 'not_as_described' },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/not_as_described/);
    });

    it('never_received reason → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concept: 'never_received' },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/never_received/);
    });

    it('duplicate_charge reason → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concept: 'duplicate_charge' },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/duplicate_charge/);
    });

    it('cancelled_within_window reason → compliance', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concept: 'cancelled_within_window' },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/cancelled_within_window/);
    });

    it('non-legitimate refund reason falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'refund_request', chosen: 'deny_refund', context: { concept: 'changed_mind' } }),
      );
      expect(result.level).toBe('conversion');
    });

    it('legitimate reason via concepts array', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concepts: ['defective_product', 'late_delivery'] },
        }),
      );
      expect(result.level).toBe('compliance');
      expect(result.reason).toMatch(/defective_product/);
    });

    it('refund_request with no reason concept falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'refund_request', chosen: 'approve_refund', context: {} }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R11 — churn_signal retention (anti-churn)', () => {
    it('high churnRisk ≥ 0.5 → retention', () => {
      const result = attributeHierarchy(
        h({ type: 'churn_signal', chosen: 'retention_offer', context: { churnRisk: 0.75 } }),
      );
      expect(result.level).toBe('retention');
      expect(result.reason).toMatch(/blocks poisonous conversion/);
    });

    it('churnRisk exactly 0.5 → retention', () => {
      const result = attributeHierarchy(
        h({ type: 'churn_signal', chosen: 'retention_offer', context: { churnRisk: 0.5 } }),
      );
      expect(result.level).toBe('retention');
    });

    it('low satisfactionScore < 0.4 → retention', () => {
      const result = attributeHierarchy(
        h({ type: 'churn_signal', chosen: 'retention_offer', context: { satisfactionScore: 0.2 } }),
      );
      expect(result.level).toBe('retention');
      expect(result.reason).toMatch(/blocks poisonous conversion/);
    });

    it('churnRisk < 0.5 and satisfaction ≥ 0.4 → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'churn_signal',
          chosen: 'retention_offer',
          context: { churnRisk: 0.3, satisfactionScore: 0.6 },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('churn_signal with no risk context → falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'churn_signal', chosen: 'retention_offer', context: {} }),
      );
      expect(result.level).toBe('conversion');
    });

    it('non-churn_signal type does not trigger R11', () => {
      const result = attributeHierarchy(
        h({ type: 'product_offer', chosen: 'top_seller', context: { churnRisk: 0.9 } }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R12 — buyer_remorse retention (anti-remorse)', () => {
    it('remorse within 7 days → retention', () => {
      const result = attributeHierarchy(
        h({ type: 'buyer_remorse', chosen: 'nurture_sequence', context: { daysSincePurchase: 3 } }),
      );
      expect(result.level).toBe('retention');
      expect(result.reason).toMatch(/anti-remorse must precede each conversion attempt/);
    });

    it('remorse at exactly 7 days → retention', () => {
      const result = attributeHierarchy(
        h({ type: 'buyer_remorse', chosen: 'nurture_sequence', context: { daysSincePurchase: 7 } }),
      );
      expect(result.level).toBe('retention');
    });

    it('high remorseScore ≥ 0.6 even after 7d → retention', () => {
      const result = attributeHierarchy(
        h({
          type: 'buyer_remorse',
          chosen: 'nurture_sequence',
          context: { daysSincePurchase: 14, remorseScore: 0.8 },
        }),
      );
      expect(result.level).toBe('retention');
      expect(result.reason).toMatch(/score 0.8/);
    });

    it('remorseScore exactly 0.6 → retention', () => {
      const result = attributeHierarchy(
        h({
          type: 'buyer_remorse',
          chosen: 'nurture_sequence',
          context: { daysSincePurchase: 10, remorseScore: 0.6 },
        }),
      );
      expect(result.level).toBe('retention');
    });

    it('days > 7 and low remorse → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'buyer_remorse',
          chosen: 'nurture_sequence',
          context: { daysSincePurchase: 30, remorseScore: 0.2 },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('buyer_remorse with no context → falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'buyer_remorse', chosen: 'nurture_sequence', context: {} }),
      );
      expect(result.level).toBe('conversion');
    });

    it('buyer_remorse blocks conversion: top_seller with high replied_rate still yields retention when remorse present', () => {
      const result = attributeHierarchy(
        h({
          type: 'buyer_remorse',
          chosen: 'nurture_sequence',
          context: { daysSincePurchase: 1, repliedRate: 0.9 },
        }),
      );
      expect(result.level).toBe('retention');
    });
  });

  describe('R13 — post_sale_offer satisfaction retention', () => {
    it('low NPS < 6 → retention', () => {
      const result = attributeHierarchy(
        h({ type: 'post_sale_offer', chosen: 'cross_sell_pro', context: { nps: 4 } }),
      );
      expect(result.level).toBe('retention');
      expect(result.reason).toMatch(/retention\/legitimacy gates before conversion/);
    });

    it('NPS exactly 5 → retention', () => {
      const result = attributeHierarchy(
        h({ type: 'post_sale_offer', chosen: 'cross_sell_pro', context: { nps: 5 } }),
      );
      expect(result.level).toBe('retention');
    });

    it('low satisfaction < 0.5 → retention', () => {
      const result = attributeHierarchy(
        h({
          type: 'post_sale_offer',
          chosen: 'upsell_premium',
          context: { satisfaction: 0.3, nps: 8 },
        }),
      );
      expect(result.level).toBe('retention');
    });

    it('unresolved_complaint concept → retention', () => {
      const result = attributeHierarchy(
        h({
          type: 'post_sale_offer',
          chosen: 'cross_sell',
          context: { nps: 9, satisfaction: 0.9, concept: 'unresolved_complaint' },
        }),
      );
      expect(result.level).toBe('retention');
      expect(result.reason).toMatch(/retention\/legitimacy gates/);
    });

    it('high NPS and high satisfaction → falls through to conversion', () => {
      const result = attributeHierarchy(
        h({
          type: 'post_sale_offer',
          chosen: 'cross_sell_pro',
          context: { nps: 9, satisfaction: 0.8 },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('post_sale_offer with default values (NPS 10, satisfaction 1) → falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'post_sale_offer', chosen: 'upsell', context: {} }),
      );
      expect(result.level).toBe('conversion');
    });

    it('post_sale_offer blocked even with imminent_purchase concept when satisfaction is low', () => {
      const result = attributeHierarchy(
        h({
          type: 'post_sale_offer',
          chosen: 'upsell',
          context: { nps: 3, concept: 'imminent_purchase' },
        }),
      );
      expect(result.level).toBe('retention');
    });
  });
});
