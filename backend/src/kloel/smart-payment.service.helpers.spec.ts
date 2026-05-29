import {
  buildConfirmedPaymentMessage,
  buildNegotiationAiPrompt,
  buildPixReadyMessage,
  buildSmartPaymentAiPrompt,
  buildSmartPaymentIdempotencyKey,
  formatBrlAmount,
  normalizeAmountKey,
  truncateConversationHistory,
  type PaymentContext,
} from './smart-payment.service.helpers';
describe('smart-payment.service.helpers', () => {
  describe('formatBrlAmount', () => {
    it('formats an integer BRL amount with Brazilian locale', () => {
      const result = formatBrlAmount(100);
      // R$ 100,00
      expect(result).toContain('100');
      expect(result).toContain('R$');
      expect(result).toContain(',');
    });

    it('formats a decimal amount to two decimal places', () => {
      const result = formatBrlAmount(139.9);
      expect(result).toContain('139');
      expect(result).toContain('90');
    });

    it('formats zero correctly', () => {
      const result = formatBrlAmount(0);
      expect(result).toContain('0,00');
    });

    it('formats negative zero as positive', () => {
      const result = formatBrlAmount(-0);
      expect(result).toContain('0,00');
    });

    it('renders NaN as R$ 0,00', () => {
      const result = formatBrlAmount(Number.NaN);
      expect(result).toContain('0,00');
    });

    it('renders Infinity as R$ 0,00', () => {
      const result = formatBrlAmount(Number.POSITIVE_INFINITY);
      expect(result).toContain('0,00');
    });
  });
  describe('normalizeAmountKey', () => {
    it('normalizes an integer to its decimal string', () => {
      expect(normalizeAmountKey(100)).toBe('100');
    });

    it('normalizes a decimal to exact string', () => {
      expect(normalizeAmountKey(139.9)).toBe('139.9');
    });

    it('rounds to 2 decimal places', () => {
      expect(normalizeAmountKey(139.999)).toBe('140');
      expect(normalizeAmountKey(139.995)).toBe('140');
    });

    it('handles zero', () => {
      expect(normalizeAmountKey(0)).toBe('0');
    });

    it('returns "0" for NaN', () => {
      expect(normalizeAmountKey(Number.NaN)).toBe('0');
    });

    it('returns "0" for Infinity', () => {
      expect(normalizeAmountKey(Number.POSITIVE_INFINITY)).toBe('0');
    });
  });
  describe('truncateConversationHistory', () => {
    it('returns an empty string for undefined input', () => {
      expect(truncateConversationHistory(undefined)).toBe('');
    });

    it('returns the full string when under 500 characters', () => {
      expect(truncateConversationHistory('hello')).toBe('hello');
    });

    it('truncates to the last 500 characters when over limit', () => {
      const prefix = 'A'.repeat(300);
      const suffix = 'B'.repeat(300);
      const result = truncateConversationHistory(prefix + suffix);
      // last 500 of 600 chars = 200 A's + 300 B's
      expect(result).toBe('A'.repeat(200) + suffix);
      expect(result).toHaveLength(500);
      expect(result.startsWith('A')).toBe(true);
      expect(result.endsWith('B')).toBe(true);
    });

    it('handles empty string', () => {
      expect(truncateConversationHistory('')).toBe('');
    });

    it('coerces null to empty string', () => {
      expect(truncateConversationHistory(null as unknown as string)).toBe('');
    });
  });
  describe('buildSmartPaymentAiPrompt', () => {
    it('includes customer name and formatted amount', () => {
      const prompt = buildSmartPaymentAiPrompt({
        customerName: 'João',
        amount: 139.9,
      });
      expect(prompt).toContain('João');
      expect(prompt).toContain('139');
      expect(prompt).toContain('Produto/Serviço');
    });

    it('includes product name when provided', () => {
      const prompt = buildSmartPaymentAiPrompt({
        customerName: 'Maria',
        productName: 'Curso Avançado',
        amount: 200,
      });
      expect(prompt).toContain('Curso Avançado');
    });

    it('includes truncated conversation when provided', () => {
      const prompt = buildSmartPaymentAiPrompt({
        customerName: 'João',
        amount: 139.9,
        conversation: 'Quero pagar com PIX',
      });
      expect(prompt).toContain('Quero pagar com PIX');
    });

    it('requests JSON output format', () => {
      const prompt = buildSmartPaymentAiPrompt({
        customerName: 'João',
        amount: 50,
      });
      expect(prompt).toContain('Responda em JSON');
      expect(prompt).toContain('"message"');
    });
  });
  describe('buildNegotiationAiPrompt', () => {
    it('includes all required fields in the prompt', () => {
      const prompt = buildNegotiationAiPrompt({
        customerName: 'Carlos',
        leadScore: 75,
        purchaseProbability: 'HIGH',
        maxDiscount: 15,
        minPurchaseForDiscount: 100,
        originalAmount: 300,
        contactMessage: 'Quero 10% de desconto',
      });
      expect(prompt).toContain('Carlos');
      expect(prompt).toContain('75');
      expect(prompt).toContain('HIGH');
      expect(prompt).toContain('15%');
      expect(prompt).toContain('Quero 10% de desconto');
    });

    it('falls back to defaults for missing fields', () => {
      const prompt = buildNegotiationAiPrompt({
        maxDiscount: 10,
        minPurchaseForDiscount: 50,
        originalAmount: 150,
        contactMessage: 'Dá desconto?',
      });
      expect(prompt).toContain('Desconhecido');
      expect(prompt).toContain('0/100');
      expect(prompt).toContain('UNKNOWN');
    });

    it('requests JSON output with approval fields', () => {
      const prompt = buildNegotiationAiPrompt({
        maxDiscount: 20,
        minPurchaseForDiscount: 100,
        originalAmount: 500,
        contactMessage: 'Preço tá alto',
      });
      expect(prompt).toContain('"approved": true/false');
      expect(prompt).toContain('"discountPercent"');
      expect(prompt).toContain('"counterOffer"');
    });
  });
  describe('buildPixReadyMessage', () => {
    it('includes customer name and formatted amount', () => {
      const msg = buildPixReadyMessage('Ana', 99.9);
      expect(msg).toContain('Ana');
      expect(msg).toContain('99');
    });

    it('references QR Code and PIX code', () => {
      const msg = buildPixReadyMessage('João', 50);
      expect(msg).toContain('QR Code');
      expect(msg).toContain('PIX');
    });
  });
  describe('buildConfirmedPaymentMessage', () => {
    it('includes formatted amount', () => {
      const msg = buildConfirmedPaymentMessage(250);
      expect(msg).toContain('250');
    });

    it('references canal cadastrado', () => {
      const msg = buildConfirmedPaymentMessage(100);
      expect(msg).toContain('canal cadastrado');
    });
  });
  describe('buildSmartPaymentIdempotencyKey', () => {
    const baseCtx: PaymentContext = {
      workspaceId: 'ws-abc',
      phone: '5511999999999',
      customerName: 'Fulano',
      amount: 139.9,
    };

    it('builds key with contactId when present', () => {
      const key = buildSmartPaymentIdempotencyKey({
        ...baseCtx,
        contactId: 'contact-42',
      });
      expect(key).toBe('smart-payment:ws-abc:contact-42:139.9:Pagamento KLOEL');
    });

    it('falls back to phone when contactId is absent', () => {
      const key = buildSmartPaymentIdempotencyKey(baseCtx);
      expect(key).toBe('smart-payment:ws-abc:5511999999999:139.9:Pagamento KLOEL');
    });

    it('includes product name when present', () => {
      const key = buildSmartPaymentIdempotencyKey({
        ...baseCtx,
        contactId: 'c1',
        productName: 'Curso X',
      });
      expect(key).toBe('smart-payment:ws-abc:c1:139.9:Curso X');
    });

    it('normalizes amount in the key', () => {
      const key = buildSmartPaymentIdempotencyKey({
        ...baseCtx,
        contactId: 'c1',
        amount: 100,
      });
      expect(key).toContain(':100:');
    });

    it('produces repeatable keys for the same input', () => {
      const k1 = buildSmartPaymentIdempotencyKey(baseCtx);
      const k2 = buildSmartPaymentIdempotencyKey({ ...baseCtx });
      expect(k1).toBe(k2);
    });
  });
});
