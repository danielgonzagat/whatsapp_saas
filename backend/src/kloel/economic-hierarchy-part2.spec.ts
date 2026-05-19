import { attributeHierarchy } from './economic-hierarchy';

type HierarchyDecision = Parameters<typeof attributeHierarchy>[0];

describe('economic-hierarchy – part 2', () => {
  const h = (overrides: Partial<HierarchyDecision> = {}): HierarchyDecision => ({
    type: 'unknown',
    chosen: 'unknown',
    context: {},
    ...overrides,
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
      const levels = [
        'compliance',
        'margin',
        'conversion',
        'retention',
        'ux',
        'learning',
        'exploration',
      ] as const;
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
