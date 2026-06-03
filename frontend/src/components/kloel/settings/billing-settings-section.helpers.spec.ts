import { describe, expect, it } from 'vitest';

import {
  computeCreditPercent,
  computeEstimatedMessages,
  extractRawPaymentMethods,
  formatCardExpiry,
  formatMoney,
  mapPaymentMethods,
  salesPeriodLabel,
  shouldShowCardsFirst,
  subscriptionLabel,
  subscriptionTone,
  type RawPaymentMethod,
} from './billing-settings-section.helpers';

describe('formatMoney', () => {
  it('renders BRL currency with PT-BR locale formatting', () => {
    expect(formatMoney(123.45)).toContain('123,45');
  });

  it('falls back to R$ 0,00 for null', () => {
    expect(formatMoney(null)).toBe('R$ 0,00');
  });

  it('falls back to R$ 0,00 for undefined', () => {
    expect(formatMoney(undefined)).toBe('R$ 0,00');
  });

  it('falls back to R$ 0,00 for NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('R$ 0,00');
  });

  it('formats zero as the placeholder string', () => {
    expect(formatMoney(0)).toContain('0,00');
  });
});

describe('subscriptionTone', () => {
  it('maps active to success', () => {
    expect(subscriptionTone('active')).toBe('success');
  });

  it('maps trial to warning', () => {
    expect(subscriptionTone('trial')).toBe('warning');
  });

  it('maps expired to danger', () => {
    expect(subscriptionTone('expired')).toBe('danger');
  });

  it('maps suspended to danger', () => {
    expect(subscriptionTone('suspended')).toBe('danger');
  });

  it('maps none to neutral', () => {
    expect(subscriptionTone('none')).toBe('neutral');
  });
});

describe('subscriptionLabel', () => {
  it('returns "Ativo" for active', () => {
    expect(subscriptionLabel('active')).toBe('Ativo');
  });

  it('returns "Teste ativo" for trial', () => {
    expect(subscriptionLabel('trial')).toBe('Teste ativo');
  });

  it('returns "Expirado" for expired', () => {
    expect(subscriptionLabel('expired')).toBe('Expirado');
  });

  it('returns "Suspenso" for suspended', () => {
    expect(subscriptionLabel('suspended')).toBe('Suspenso');
  });

  it('returns "Inativo" for none (the default branch)', () => {
    expect(subscriptionLabel('none')).toBe('Inativo');
  });
});

describe('computeEstimatedMessages', () => {
  it('returns 0 for a zero balance', () => {
    expect(computeEstimatedMessages(0)).toBe(0);
  });

  it('returns 0 for a negative balance', () => {
    expect(computeEstimatedMessages(-3)).toBe(0);
  });

  it('returns 100 messages per US$1 credit (floor)', () => {
    expect(computeEstimatedMessages(1)).toBe(100);
    expect(computeEstimatedMessages(2.5)).toBe(250);
  });

  it('floors fractional balances', () => {
    expect(computeEstimatedMessages(0.999)).toBe(99);
  });

  it('returns 0 for NaN / Infinity', () => {
    expect(computeEstimatedMessages(Number.NaN)).toBe(0);
    expect(computeEstimatedMessages(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('computeCreditPercent', () => {
  it('returns 0 for a zero balance', () => {
    expect(computeCreditPercent(0)).toBe(0);
  });

  it('returns 0 for a negative balance', () => {
    expect(computeCreditPercent(-1)).toBe(0);
  });

  it('returns 100 when balance reaches the cap (US$5)', () => {
    expect(computeCreditPercent(5)).toBe(100);
  });

  it('clamps to 100 when balance overshoots', () => {
    expect(computeCreditPercent(50)).toBe(100);
  });

  it('linearly interpolates between 0 and 5', () => {
    expect(computeCreditPercent(2.5)).toBe(50);
    expect(computeCreditPercent(1)).toBe(20);
  });

  it('returns 0 for NaN / Infinity', () => {
    expect(computeCreditPercent(Number.NaN)).toBe(0);
    expect(computeCreditPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('formatCardExpiry', () => {
  it('zero-pads the month and trims the year to 2 digits', () => {
    expect(formatCardExpiry(7, 2027)).toBe('07/27');
  });

  it('accepts string inputs identically', () => {
    expect(formatCardExpiry('7', '2027')).toBe('07/27');
  });

  it('returns empty when either component is missing', () => {
    expect(formatCardExpiry(undefined, 2027)).toBe('');
    expect(formatCardExpiry(7, undefined)).toBe('');
    expect(formatCardExpiry(undefined, undefined)).toBe('');
  });

  it('treats empty strings as missing', () => {
    expect(formatCardExpiry('', 2027)).toBe('');
    expect(formatCardExpiry(7, '')).toBe('');
  });

  it('preserves two-digit years as-is', () => {
    expect(formatCardExpiry(12, '27')).toBe('12/27');
  });
});

describe('mapPaymentMethods', () => {
  it('uppercases the brand and zero-pads the expiry', () => {
    const raw: RawPaymentMethod[] = [
      { id: 'pm_1', last4: '4242', brand: 'visa', expMonth: 7, expYear: 2027, isDefault: true },
    ];
    expect(mapPaymentMethods(raw)).toEqual([
      {
        id: 'pm_1',
        last4: '4242',
        brand: 'VISA',
        expiry: '07/27',
        isDefault: true,
      },
    ]);
  });

  it('defaults the brand to CARD when missing', () => {
    const [card] = mapPaymentMethods([{ id: 'pm_2' }]);
    expect(card?.brand).toBe('CARD');
  });

  it('coerces missing isDefault into a boolean false', () => {
    const raw: RawPaymentMethod[] = [{ id: 'pm_3' }];
    const [card] = mapPaymentMethods(raw);
    expect(card?.isDefault).toBe(false);
  });

  it('coerces truthy isDefault into a boolean true', () => {
    const raw: RawPaymentMethod[] = [{ id: 'pm_4', isDefault: true }];
    const [card] = mapPaymentMethods(raw);
    expect(card?.isDefault).toBe(true);
  });

  it('returns an empty array for an empty input', () => {
    expect(mapPaymentMethods([])).toEqual([]);
  });
});

describe('extractRawPaymentMethods', () => {
  it('returns the paymentMethods array when present', () => {
    const envelope = { paymentMethods: [{ id: 'pm_1' }] };
    expect(extractRawPaymentMethods(envelope)).toEqual([{ id: 'pm_1' }]);
  });

  it('throws when the envelope is undefined', () => {
    expect(() => extractRawPaymentMethods(undefined)).toThrow('Payload de cartoes invalido.');
  });

  it('throws when paymentMethods is absent', () => {
    expect(() => extractRawPaymentMethods({})).toThrow('Payload de cartoes invalido.');
  });

  it('throws when paymentMethods is not an array', () => {
    expect(() =>
      extractRawPaymentMethods({ paymentMethods: { id: 'pm_1' } } as unknown as {
        paymentMethods?: RawPaymentMethod[];
      }),
    ).toThrow('Payload de cartoes invalido.');
  });
});

describe('shouldShowCardsFirst', () => {
  it('returns true only when scrolling AND no card on file', () => {
    expect(shouldShowCardsFirst(true, false)).toBe(true);
  });

  it('returns false when the user already has a card', () => {
    expect(shouldShowCardsFirst(true, true)).toBe(false);
  });

  it('returns false when not deep-linking to the credit card section', () => {
    expect(shouldShowCardsFirst(false, false)).toBe(false);
    expect(shouldShowCardsFirst(false, true)).toBe(false);
  });
});

describe('salesPeriodLabel', () => {
  it('returns "7 dias" for the week window', () => {
    expect(salesPeriodLabel('week')).toBe('7 dias');
  });

  it('returns "30 dias" for the month window', () => {
    expect(salesPeriodLabel('month')).toBe('30 dias');
  });
});
