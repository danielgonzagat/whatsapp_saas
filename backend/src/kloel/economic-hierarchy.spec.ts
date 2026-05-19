import { attributeHierarchy } from './economic-hierarchy';

type HierarchyDecision = Parameters<typeof attributeHierarchy>[0];
type HierarchyLevel = ReturnType<typeof attributeHierarchy>['level'];

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
      expect(result.reason).toMatch(/before an'+'y conversion attempt/);
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
      expect(result.reason).toMatch(/anti-remorse must precede any conversion attempt/);
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

  describe('R4 — aggressiveness ceiling → ux', () => {
    it('brain above ceiling → ux', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'baixa',
          context: { brainAggressiveness: 'alta', aggressivenessCeiling: 'baixa' },
        }),
      );
      expect(result.level).toBe('ux');
      expect(result.reason).toMatch(/respects operator ceiling/);
    });

    it('brain equals ceiling → ux', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'normal',
          context: { brainAggressiveness: 'normal', aggressivenessCeiling: 'normal' },
        }),
      );
      expect(result.level).toBe('ux');
      expect(result.reason).toMatch(/ux-driven cap/);
    });

    it('brain below ceiling → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'baixa',
          context: { brainAggressiveness: 'baixa', aggressivenessCeiling: 'alta' },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('English labels: HIGH/MEDIUM/LOW', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'medium',
          context: { brainAggressiveness: 'HIGH', aggressivenessCeiling: 'MEDIUM' },
        }),
      );
      expect(result.level).toBe('ux');
    });
  });

  describe('R5 — audio preference → ux', () => {
    it('audio chosen, arsenal and audio_preference concept → ux', () => {
      const result = attributeHierarchy(
        h({
          type: 'audio_vs_text',
          chosen: 'audio',
          context: { audioRatio: 0.25, arsenalCount: 5, concept: 'audio_preference' },
        }),
      );
      expect(result.level).toBe('ux');
      expect(result.reason).toMatch(/lead prefers audio/);
    });

    it('audio chosen, high audioRatio, arsenal → ux', () => {
      const result = attributeHierarchy(
        h({
          type: 'audio_vs_text',
          chosen: 'audio',
          context: { audioRatio: 0.3, arsenalCount: 3 },
        }),
      );
      expect(result.level).toBe('ux');
    });

    it('audio chosen, no arsenal → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'audio_vs_text',
          chosen: 'audio',
          context: { audioRatio: 0.3, arsenalCount: 0 },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('text chosen → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'audio_vs_text',
          chosen: 'text',
          context: { audioRatio: 0.3, arsenalCount: 5, concept: 'audio_preference' },
        }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R6 — highest_margin product → margin', () => {
    it('highest_margin chosen → margin', () => {
      const result = attributeHierarchy(
        h({ type: 'product_offer', chosen: 'highest_margin', context: {} }),
      );
      expect(result.level).toBe('margin');
      expect(result.reason).toMatch(/highest-margin variant/);
    });

    it('other product → falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'product_offer', chosen: 'entry_product', context: {} }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R7 — top_seller with high replied_rate → conversion', () => {
    it('top_seller + high replied_rate → conversion', () => {
      const result = attributeHierarchy(
        h({ type: 'product_offer', chosen: 'top_seller', context: { repliedRate: 0.45 } }),
      );
      expect(result.level).toBe('conversion');
      expect(result.reason).toMatch(/conversion opportunity/);
    });

    it('top_seller + low replied_rate → falls through', () => {
      const result = attributeHierarchy(
        h({ type: 'product_offer', chosen: 'top_seller', context: { repliedRate: 0.1 } }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R8 — aggressiveness escalation with imminent_purchase → conversion', () => {
    it('imminent_purchase + escalated → conversion', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'alta',
          context: { concept: 'imminent_purchase' },
        }),
      );
      expect(result.level).toBe('conversion');
      expect(result.reason).toMatch(/imminent purchase/);
    });

    it('hot_lead + escalated → conversion', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'normal',
          context: { concept: 'hot_lead' },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('imminent_purchase but low aggressiveness → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'baixa',
          context: { concept: 'imminent_purchase' },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('escalated without imminent_purchase → R4 takes precedence', () => {
      const result = attributeHierarchy(
        h({
          type: 'cia_aggressiveness',
          chosen: 'baixa',
          context: {
            brainAggressiveness: 'alta',
            aggressivenessCeiling: 'baixa',
            concept: 'general',
          },
        }),
      );
      expect(result.level).toBe('ux');
    });
  });

  describe('R9 — low confidence learning', () => {
    it('confidence < 0.5 and baseline < 0.5 → learning', () => {
      const result = attributeHierarchy(
        h({
          type: 'audio_vs_text',
          chosen: 'text',
          context: { confidence: 0.3, baselineConfidence: 0.3 },
        }),
      );
      expect(result.level).toBe('learning');
      expect(result.reason).toMatch(/exploring within low-risk window/);
    });

    it('confidence >= 0.5 → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'audio_vs_text',
          chosen: 'text',
          context: { confidence: 0.6, baselineConfidence: 0.3 },
        }),
      );
      expect(result.level).toBe('conversion');
    });

    it('confidence < 0.5 but baseline high → falls through', () => {
      const result = attributeHierarchy(
        h({
          type: 'audio_vs_text',
          chosen: 'text',
          context: { confidence: 0.3, baselineConfidence: 0.6 },
        }),
      );
      expect(result.level).toBe('conversion');
    });
  });

  describe('R10 — default fallback', () => {
    it('unknown decision type → conversion', () => {
      const result = attributeHierarchy(h({ type: 'some_unknown', chosen: 'anything' }));
      expect(result.level).toBe('conversion');
      expect(result.reason).toMatch(/unclassified/);
    });

    it('known type but no rule matches → conversion', () => {
      const result = attributeHierarchy(h({ type: 'message_format', chosen: 'text', context: {} }));
      expect(result.level).toBe('conversion');
    });
  });

  describe('edge cases', () => {
    it('empty context', () => {
      const result = attributeHierarchy(h());
      expect(result.level).toBe('conversion');
    });

    it('missing optional fields', () => {
      const result = attributeHierarchy(h({ type: 'cia_aggressiveness', chosen: 'normal' }));
      expect(result.level).toBe('conversion');
    });

    it('all valid HierarchyLevel values are usable', () => {
      const levels: HierarchyLevel[] = [
        'compliance',
        'margin',
        'conversion',
        'retention',
        'ux',
        'learning',
        'exploration',
      ];
      expect(levels.length).toBe(7);
      for (const level of levels) {
        expect(typeof level).toBe('string');
      }
    });

    it('retention level is reachable via R11 churn_signal', () => {
      const result = attributeHierarchy(
        h({ type: 'churn_signal', chosen: 'retention_offer', context: { churnRisk: 0.9 } }),
      );
      expect(result.level).toBe('retention');
    });

    it('compliance level from refund legitimacy takes precedence over retention', () => {
      const result = attributeHierarchy(
        h({
          type: 'refund_request',
          chosen: 'approve_refund',
          context: { concept: 'defective_product', churnRisk: 0.9 },
        }),
      );
      expect(result.level).toBe('compliance');
    });

    it('post-sale decisions: refund → compliance > churn → retention > post_sale → retention over ux/margin/conversion', () => {
      const refund = attributeHierarchy(
        h({ type: 'refund_request', chosen: 'approve', context: { concept: 'defective_product' } }),
      );
      const churn = attributeHierarchy(
        h({ type: 'churn_signal', chosen: 'retention', context: { churnRisk: 0.9 } }),
      );
      const remorse = attributeHierarchy(
        h({ type: 'buyer_remorse', chosen: 'nurture', context: { daysSincePurchase: 1 } }),
      );
      const postSale = attributeHierarchy(
        h({ type: 'post_sale_offer', chosen: 'upsell', context: { nps: 3 } }),
      );
      expect(refund.level).toBe('compliance');
      expect(churn.level).toBe('retention');
      expect(remorse.level).toBe('retention');
      expect(postSale.level).toBe('retention');
    });
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
      expect(result.reason).toMatch(/before an'+'y conversion attempt/);
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
          context: {
            discountPercent: 10,
            channelMaxDiscount: 15,
            marginRemaining: 30,
            churnRisk: 0.9,
          },
        }),
      );
      expect(result.level).toBe('margin');
    });
  });
});
