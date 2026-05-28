import {
  formatProductContext,
  formatProductLine,
  isCommercialAction,
  resolveHardcodedNightResponse,
  RESPONSE_TEMPLATES,
  resolveResponseTemplate,
  resolveResponseType,
} from './autopilot-cycle-executor.helpers';

describe('autopilot-cycle-executor.helpers — response', () => {
  describe('isCommercialAction', () => {
    it.each(['offer', 'offer_soft', 'price', 'upsell', 'lead_unlocker'])(
      'flags %s as commercial',
      (t) => {
        expect(isCommercialAction(t)).toBe(true);
      },
    );
    it.each(['chat', 'qualify', 'objection', 'follow_up', 'random'])(
      'does not flag %s as commercial',
      (t) => {
        expect(isCommercialAction(t)).toBe(false);
      },
    );
  });

  describe('resolveResponseType', () => {
    it('returns the mapped type for known actions', () => {
      expect(resolveResponseType('send_offer')).toBe('offer');
      expect(resolveResponseType('try_upsell')).toBe('upsell');
      expect(resolveResponseType('ai_chat')).toBe('chat');
    });
    it('returns null for unmapped actions', () => {
      expect(resolveResponseType('send_calendar')).toBeNull();
      expect(resolveResponseType('handover_human')).toBeNull();
      expect(resolveResponseType('soft_close_night')).toBeNull();
      expect(resolveResponseType('totally_unknown')).toBeNull();
    });
  });

  describe('resolveHardcodedNightResponse', () => {
    it('returns the canned text for night actions', () => {
      expect(resolveHardcodedNightResponse('soft_close_night')).toContain(
        'Já deixei tudo preparado',
      );
      expect(resolveHardcodedNightResponse('auto_reply_night')).toContain(
        'Amanhã 8h te respondo',
      );
    });
    it('returns null for other actions', () => {
      expect(resolveHardcodedNightResponse('send_offer')).toBeNull();
      expect(resolveHardcodedNightResponse('')).toBeNull();
    });
  });

  describe('resolveResponseTemplate', () => {
    it('returns the matching template', () => {
      expect(resolveResponseTemplate('offer')).toBe(RESPONSE_TEMPLATES.offer);
      expect(resolveResponseTemplate('qualify')).toBe(
        RESPONSE_TEMPLATES.qualify,
      );
    });
    it('falls back to the chat template for unknown types', () => {
      expect(resolveResponseTemplate('not_a_real_type')).toBe(
        RESPONSE_TEMPLATES.chat,
      );
    });
  });

  describe('formatProductLine', () => {
    it('formats BRL products with the R$ prefix and 2 decimals', () => {
      expect(
        formatProductLine({
          name: 'Curso X',
          price: 199.9,
          currency: 'BRL',
          description: 'Acesso vitalício',
        }),
      ).toBe('- Curso X: R$199.90 — Acesso vitalício');
    });
    it('formats non-BRL with currency code prefix', () => {
      expect(
        formatProductLine({
          name: 'Plan',
          price: 9.95,
          currency: 'USD',
          description: null,
        }),
      ).toBe('- Plan: USD 9.95');
    });
    it('omits the description suffix when description is null', () => {
      expect(
        formatProductLine({
          name: 'A',
          price: 1,
          currency: 'BRL',
          description: null,
        }),
      ).toBe('- A: R$1.00');
    });
  });

  describe('formatProductContext', () => {
    it('joins product lines with newlines preserving order', () => {
      const out = formatProductContext([
        { name: 'A', price: 10, currency: 'BRL', description: null },
        { name: 'B', price: 20, currency: 'USD', description: 'Pro' },
      ]);
      expect(out).toBe('- A: R$10.00\n- B: USD 20.00 — Pro');
    });
    it('returns empty string for empty input', () => {
      expect(formatProductContext([])).toBe('');
    });
  });
});
