import { inferActionDescriptor } from './build-mind-signals.infer-action.helper';

describe('inferActionDescriptor', () => {
  it('returns message_send for routine chat text', () => {
    expect(inferActionDescriptor('oi tudo bem', undefined)).toEqual({
      kind: 'message_send',
      target: 'lead',
      reversible: true,
    });
  });

  it('returns payment_action for payment-related text', () => {
    const result = inferActionDescriptor('quero pagar com pix', undefined);
    expect(result.kind).toBe('payment_action');
    expect(result.target).toBe('lead');
    expect(result.reversible).toBe(true);
  });

  it('returns lead_block when blocking verbs present', () => {
    expect(inferActionDescriptor('bloquear este lead', undefined)).toEqual({
      kind: 'lead_block',
      target: 'lead',
      reversible: true,
    });
  });

  it('returns public_response for publish verbs', () => {
    expect(inferActionDescriptor('postar publicamente', undefined)).toEqual({
      kind: 'public_response',
      target: 'public',
      reversible: true,
    });
  });

  it('treats financial concepts as payment_action even without trigger word', () => {
    const result = inferActionDescriptor('quanto custa?', [{ concept: 'price', confidence: 0.9 }]);
    expect(result.kind).toBe('payment_action');
  });
});
