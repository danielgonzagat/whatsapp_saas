import { PaymentProviderRouterService } from './provider-router.service';

describe('PaymentProviderRouterService', () => {
  const router = new PaymentProviderRouterService();

  it('routes PIX to MercadoPago', () => {
    const decision = router.resolve({ method: 'pix' });
    expect(decision.provider).toBe('mercadopago');
    expect(decision.reason).toContain('PIX');
  });

  it('routes boleto to MercadoPago', () => {
    const decision = router.resolve({ method: 'boleto' });
    expect(decision.provider).toBe('mercadopago');
    expect(decision.reason).toContain('boleto');
  });

  it('routes card to Stripe', () => {
    const decision = router.resolve({ method: 'card' });
    expect(decision.provider).toBe('stripe');
    expect(decision.reason).toContain('Stripe');
  });

  it('static and instance methods agree', () => {
    for (const method of ['pix', 'card', 'boleto'] as const) {
      expect(router.resolve({ method })).toEqual(
        PaymentProviderRouterService.resolveStatic(method),
      );
    }
  });
});
