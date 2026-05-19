import {
  assertCustomerSafe,
  composeCustomerMessage,
  type InternalReplyPlan,
} from './commercial-decision-orchestrator.service';

describe('commercial-decision-orchestrator — customer-safe guard (P1.3)', () => {
  describe('assertCustomerSafe', () => {
    it('throws when text reads like the orchestrator internal plan (3rd-person directives)', () => {
      const leakedPlan =
        'Responder com tom consultivo e intensidade normal. Usar apenas os 3 produto(s) habilitados para este canal. Direcionar a oferta para top_seller.';
      expect(() => assertCustomerSafe(leakedPlan)).toThrow(/customer-safe-violation/);
    });

    it.each([
      'Responder com tom consultivo',
      'Usar apenas os 5 produtos habilitados',
      'Priorizar o arsenal aprovado do canal',
      'Tratar a objeção de preço com política coupon_10',
      'Direcionar a oferta para premium_product',
      'Conduzir para o próximo passo de compra',
    ])('rejects directive: "%s"', (snippet) => {
      expect(() => assertCustomerSafe(snippet)).toThrow(/customer-safe-violation/);
    });

    it('throws on empty string', () => {
      expect(() => assertCustomerSafe('')).toThrow(/customer-safe-violation/);
      expect(() => assertCustomerSafe('   ')).toThrow(/customer-safe-violation/);
    });

    it('accepts legitimate customer-facing first/second-person text', () => {
      expect(() =>
        assertCustomerSafe('Oi! Vi sua mensagem e já estou olhando aqui para te responder.'),
      ).not.toThrow();
      expect(() =>
        assertCustomerSafe(
          'Entendo a preocupação com o valor. Consigo liberar um desconto especial de 10% válido por 24h.',
        ),
      ).not.toThrow();
      expect(() => assertCustomerSafe('Perfeito, vou te mandar o link agora.')).not.toThrow();
    });
  });

  describe('composeCustomerMessage', () => {
    const basePlan: InternalReplyPlan = {
      aggressiveness: 'normal',
      concept: 'general',
      tone: 'consultivo',
    };

    it('emits a coupon-aware message for price_objection + couponAction', () => {
      const msg = composeCustomerMessage({
        ...basePlan,
        concept: 'price_objection',
        couponAction: 'coupon_15',
      });
      expect(msg).toMatch(/15%/);
      // Must read like a customer-facing message, not an instruction.
      expect(() => assertCustomerSafe(msg)).not.toThrow();
    });

    it('emits a fallback budget question for price_objection without coupon', () => {
      const msg = composeCustomerMessage({ ...basePlan, concept: 'price_objection' });
      expect(msg).toMatch(/or[çc]amento|valor|pre[çc]o/i);
      expect(() => assertCustomerSafe(msg)).not.toThrow();
    });

    it('emits a buying-next-step message for imminent_purchase', () => {
      const msg = composeCustomerMessage({ ...basePlan, concept: 'imminent_purchase' });
      expect(msg).toMatch(/pr[oó]ximo passo|link/i);
      expect(() => assertCustomerSafe(msg)).not.toThrow();
    });

    it('emits a trust-building message for trust_objection', () => {
      const msg = composeCustomerMessage({ ...basePlan, concept: 'trust_objection' });
      expect(msg.toLowerCase()).toMatch(/prov|client/);
      expect(() => assertCustomerSafe(msg)).not.toThrow();
    });

    it('emits a no-pressure ack for fatigue_risk', () => {
      const msg = composeCustomerMessage({ ...basePlan, concept: 'fatigue_risk' });
      expect(msg.toLowerCase()).toMatch(/sem pressa|quando voc[eê]/);
      expect(() => assertCustomerSafe(msg)).not.toThrow();
    });

    it('emits an audio-preference acknowledgement', () => {
      const msg = composeCustomerMessage({ ...basePlan, concept: 'audio_preference' });
      expect(msg.toLowerCase()).toContain('áudio');
      expect(() => assertCustomerSafe(msg)).not.toThrow();
    });

    it('emits a neutral holding message for unmatched concept', () => {
      const msg = composeCustomerMessage({ ...basePlan, concept: 'unknown_concept_xyz' });
      expect(msg).toBeTruthy();
      expect(() => assertCustomerSafe(msg)).not.toThrow();
    });

    it('every concept emits a customer-safe message — full sweep', () => {
      const concepts = [
        'general',
        'price_objection',
        'imminent_purchase',
        'hot_lead',
        'trust_objection',
        'fatigue_risk',
        'audio_preference',
        'cold',
        'recovery',
        'follow_up',
      ];
      for (const concept of concepts) {
        const msg = composeCustomerMessage({ ...basePlan, concept });
        expect(msg).toBeTruthy();
        // The whole point: NO concept can produce a third-person directive.
        expect(() => assertCustomerSafe(msg)).not.toThrow();
      }
    });
  });
});
