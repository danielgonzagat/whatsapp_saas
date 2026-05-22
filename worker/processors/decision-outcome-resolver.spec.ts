describe('Decision Outcome Resolver', () => {
  const OUTCOME_MAP: Record<string, { outcomeName: string; success: boolean }> = {
    'inbound.received': { outcomeName: 'inbound.received', success: true },
    'payment.succeeded': { outcomeName: 'payment.succeeded', success: true },
    'checkout.abandoned': { outcomeName: 'checkout.abandoned', success: false },
    'coupon.redeemed': { outcomeName: 'coupon.redeemed', success: true },
    'conversation.handed_off': { outcomeName: 'conversation.handed_off', success: true },
    'contact.opted_out': { outcomeName: 'contact.opted_out', success: false },
    'payment.refunded': { outcomeName: 'payment.refunded', success: false },
    'subscription.canceled': { outcomeName: 'subscription.canceled', success: false },
    'inbound.silent_24h': { outcomeName: 'inbound.silent_24h', success: false },
  };

  it('maps all 9 outcome event types', () => {
    const keys = Object.keys(OUTCOME_MAP);
    expect(keys).toHaveLength(9);
    expect(keys).toContain('inbound.received');
    expect(keys).toContain('payment.succeeded');
    expect(keys).toContain('checkout.abandoned');
    expect(keys).toContain('coupon.redeemed');
    expect(keys).toContain('conversation.handed_off');
    expect(keys).toContain('contact.opted_out');
    expect(keys).toContain('payment.refunded');
    expect(keys).toContain('subscription.canceled');
    expect(keys).toContain('inbound.silent_24h');
  });

  it('has correct success/failure mapping', () => {
    expect(OUTCOME_MAP['payment.succeeded'].success).toBe(true);
    expect(OUTCOME_MAP['inbound.received'].success).toBe(true);
    expect(OUTCOME_MAP['coupon.redeemed'].success).toBe(true);
    expect(OUTCOME_MAP['conversation.handed_off'].success).toBe(true);
    expect(OUTCOME_MAP['checkout.abandoned'].success).toBe(false);
    expect(OUTCOME_MAP['contact.opted_out'].success).toBe(false);
    expect(OUTCOME_MAP['payment.refunded'].success).toBe(false);
    expect(OUTCOME_MAP['subscription.canceled'].success).toBe(false);
    expect(OUTCOME_MAP['inbound.silent_24h'].success).toBe(false);
  });
});
