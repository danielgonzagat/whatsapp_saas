import { describe, expect, it } from 'vitest';
import {
  buildActiveCardStyle,
  buildInstallmentSelectStyle,
  buildLabelStyle,
  buildLockedCardStyle,
  buildManualCardFormId,
  buildSubmitButtonStyle,
  isSectionLocked,
  resolveSectionCardRadius,
  resolveSubmitButtonFormId,
  resolveSubmitButtonLabel,
  resolveSubmitButtonType,
  shouldShowSubmitError,
  usesStripePaymentElement,
} from './CheckoutPaymentSection.helpers';
import { buildBlancTheme, buildNoirTheme } from './checkout-theme-tokens';

const blanc = buildBlancTheme();
const noir = buildNoirTheme();

describe('CheckoutPaymentSection.helpers / resolveSectionCardRadius', () => {
  it('returns the slim 6px radius when the input radius is 6', () => {
    expect(resolveSectionCardRadius(6)).toBe(6);
  });

  it('returns the wide 12px radius for every other input radius', () => {
    expect(resolveSectionCardRadius(8)).toBe(12);
    expect(resolveSectionCardRadius(12)).toBe(12);
    expect(resolveSectionCardRadius(0)).toBe(12);
  });
});

describe('CheckoutPaymentSection.helpers / buildLabelStyle', () => {
  it('uses mutedText colour when the theme mode is NOIR', () => {
    const style = buildLabelStyle(noir);
    expect(style.color).toBe(noir.mutedText);
    expect(style.display).toBe('block');
    expect(style.fontSize).toBe(14);
    expect(style.fontWeight).toBe(500);
    expect(style.marginBottom).toBe(6);
  });

  it('uses the primary text colour when the theme mode is not NOIR', () => {
    const style = buildLabelStyle(blanc);
    expect(style.color).toBe(blanc.text);
  });
});

describe('CheckoutPaymentSection.helpers / buildActiveCardStyle', () => {
  it('mirrors the theme card surface tokens exactly', () => {
    const style = buildActiveCardStyle(blanc);
    expect(style.background).toBe(blanc.cardBackground);
    expect(style.border).toBe(`1px solid ${blanc.cardBorder}`);
    expect(style.boxShadow).toBe(blanc.cardShadow);
    expect(style.padding).toBe('24px 20px');
    expect(style.animation).toBe('fadeIn 0.3s');
  });

  it('picks the slim 6px card radius when the input radius is 6', () => {
    const themed = { ...noir, input: { ...noir.input, radius: 6 } };
    expect(buildActiveCardStyle(themed).borderRadius).toBe(6);
  });

  it('picks the wide 12px card radius for non-slim input radii', () => {
    const themed = { ...blanc, input: { ...blanc.input, radius: 8 } };
    expect(buildActiveCardStyle(themed).borderRadius).toBe(12);
  });
});

describe('CheckoutPaymentSection.helpers / buildLockedCardStyle', () => {
  it('matches the active card style verbatim except for the dimmed opacity', () => {
    const active = buildActiveCardStyle(blanc);
    const locked = buildLockedCardStyle(blanc);
    expect(locked.opacity).toBe(0.35);
    expect(locked.background).toBe(active.background);
    expect(locked.border).toBe(active.border);
    expect(locked.boxShadow).toBe(active.boxShadow);
    expect(locked.borderRadius).toBe(active.borderRadius);
    expect(locked.padding).toBe(active.padding);
    expect(locked.animation).toBe(active.animation);
  });
});

describe('CheckoutPaymentSection.helpers / usesStripePaymentElement', () => {
  it('returns true only when card is selected and both stripe inputs are provided', () => {
    expect(usesStripePaymentElement('card', 'cs_test_abc', 'https://example/return')).toBe(true);
  });

  it('returns false when the payment method is not card', () => {
    expect(usesStripePaymentElement('pix', 'cs_test_abc', 'https://example/return')).toBe(false);
    expect(usesStripePaymentElement('boleto', 'cs_test_abc', 'https://example/return')).toBe(false);
  });

  it('returns false when stripeClientSecret is missing or empty', () => {
    expect(usesStripePaymentElement('card', null, 'https://example/return')).toBe(false);
    expect(usesStripePaymentElement('card', undefined, 'https://example/return')).toBe(false);
    expect(usesStripePaymentElement('card', '', 'https://example/return')).toBe(false);
  });

  it('returns false when stripeReturnUrl is missing or empty', () => {
    expect(usesStripePaymentElement('card', 'cs_test_abc', undefined)).toBe(false);
    expect(usesStripePaymentElement('card', 'cs_test_abc', '')).toBe(false);
  });
});

describe('CheckoutPaymentSection.helpers / shouldShowSubmitError', () => {
  it('returns true only when there is an error and step equals 3', () => {
    expect(shouldShowSubmitError('boom', 3)).toBe(true);
  });

  it('returns false when there is no error message', () => {
    expect(shouldShowSubmitError('', 3)).toBe(false);
  });

  it('returns false when the user is not on step 3', () => {
    expect(shouldShowSubmitError('boom', 1)).toBe(false);
    expect(shouldShowSubmitError('boom', 2)).toBe(false);
    expect(shouldShowSubmitError('boom', 4)).toBe(false);
  });
});

describe('CheckoutPaymentSection.helpers / isSectionLocked', () => {
  it('returns true while the user has not reached step 3', () => {
    expect(isSectionLocked(0)).toBe(true);
    expect(isSectionLocked(1)).toBe(true);
    expect(isSectionLocked(2)).toBe(true);
  });

  it('returns false once the user reaches or passes step 3', () => {
    expect(isSectionLocked(3)).toBe(false);
    expect(isSectionLocked(4)).toBe(false);
  });
});

describe('CheckoutPaymentSection.helpers / buildManualCardFormId', () => {
  it('appends the stable card-form suffix to the supplied base id', () => {
    expect(buildManualCardFormId(':r0:')).toBe(':r0:-card-form');
  });

  it('handles empty base ids without crashing', () => {
    expect(buildManualCardFormId('')).toBe('-card-form');
  });
});

describe('CheckoutPaymentSection.helpers / resolveSubmitButtonType', () => {
  it('returns submit when the active method is card', () => {
    expect(resolveSubmitButtonType('card')).toBe('submit');
  });

  it('returns button for pix and boleto so the click handler can fire', () => {
    expect(resolveSubmitButtonType('pix')).toBe('button');
    expect(resolveSubmitButtonType('boleto')).toBe('button');
  });
});

describe('CheckoutPaymentSection.helpers / resolveSubmitButtonFormId', () => {
  it('returns the manual form id only when card is active', () => {
    expect(resolveSubmitButtonFormId('card', 'mid')).toBe('mid');
  });

  it('returns undefined when the active method is not card', () => {
    expect(resolveSubmitButtonFormId('pix', 'mid')).toBeUndefined();
    expect(resolveSubmitButtonFormId('boleto', 'mid')).toBeUndefined();
  });
});

describe('CheckoutPaymentSection.helpers / resolveSubmitButtonLabel', () => {
  it('returns the processing copy while a submission is in flight', () => {
    expect(resolveSubmitButtonLabel(true, undefined)).toBe('Processando...');
    expect(resolveSubmitButtonLabel(true, { btnFinalizeText: 'Pagar agora' } as never)).toBe(
      'Processando...',
    );
  });

  it('honours the configured finalize button text when not submitting', () => {
    expect(resolveSubmitButtonLabel(false, { btnFinalizeText: 'Pagar agora' } as never)).toBe(
      'Pagar agora',
    );
  });

  it('falls back to the default Portuguese label when no config copy is set', () => {
    expect(resolveSubmitButtonLabel(false, undefined)).toBe('Finalizar compra');
    expect(resolveSubmitButtonLabel(false, { btnFinalizeText: '' } as never)).toBe(
      'Finalizar compra',
    );
  });
});

describe('CheckoutPaymentSection.helpers / buildSubmitButtonStyle', () => {
  it('reflects the theme accent, button text colour and input radius', () => {
    const style = buildSubmitButtonStyle(blanc);
    expect(style.width).toBe('100%');
    expect(style.marginTop).toBe(20);
    expect(style.padding).toBe(16);
    expect(style.background).toBe(blanc.accent);
    expect(style.border).toBe('none');
    expect(style.borderRadius).toBe(blanc.input.radius);
    expect(style.color).toBe(blanc.buttonText);
    expect(style.fontSize).toBe(18);
    expect(style.fontWeight).toBe(700);
  });
});

describe('CheckoutPaymentSection.helpers / buildInstallmentSelectStyle', () => {
  it('mirrors the input theme tokens for the installments select', () => {
    const style = buildInstallmentSelectStyle(blanc);
    expect(style.width).toBe('100%');
    expect(style.padding).toBe('13px 16px');
    expect(style.background).toBe(blanc.input.background);
    expect(style.border).toBe(`1px solid ${blanc.input.border}`);
    expect(style.borderRadius).toBe(blanc.input.radius);
    expect(style.fontSize).toBe(15);
    expect(style.color).toBe(blanc.text);
    expect(style.fontFamily).toBe("'DM Sans', sans-serif");
    expect(style.outline).toBe('none');
  });
});
