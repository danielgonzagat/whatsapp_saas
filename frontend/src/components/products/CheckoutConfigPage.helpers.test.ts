import { describe, it, expect } from 'vitest';
import {
  BORDER,
  createInitialCheckoutConfigState,
  dividerStyle,
  ELEVATED,
  EMBER,
  FAINT,
  inputStyle,
  labelStyle,
  SECONDARY,
  sectionTitleStyle,
  SURFACE,
  TEXT,
  TEXT_ON_ACCENT,
  textareaStyle,
  VOID,
  type CheckoutConfigInput,
} from './CheckoutConfigPage.helpers';

describe('createInitialCheckoutConfigState', () => {
  it('returns full default state when config is null', () => {
    const state = createInitialCheckoutConfigState(null);
    expect(state.checkoutName).toBe('');
    expect(state.enableCreditCard).toBe(false);
    expect(state.enablePix).toBe(false);
    expect(state.chatEnabled).toBe(false);
    expect(state.chatWelcomeMessage).toBe('');
    expect(state.chatDelay).toBe(5);
    expect(state.chatPosition).toBe('bottom-right');
    expect(state.chatColor).toBe('colors.ember.primary');
    expect(state.chatOfferDiscount).toBe(false);
    expect(state.chatDiscountCode).toBe('');
    expect(state.chatSupportPhone).toBe('');
    expect(state.enableCoupon).toBe(false);
    expect(state.enableTimer).toBe(false);
    expect(state.timerMinutes).toBe(10);
    expect(state.timerMessage).toBe('');
    expect(state.socialProofEnabled).toBe(false);
    expect(state.socialProofCustomNames).toBe('');
    expect(state.enableSteps).toBe(false);
  });

  it('returns full default state when config is undefined', () => {
    const state = createInitialCheckoutConfigState(undefined);
    expect(state.checkoutName).toBe('');
    expect(state.chatDelay).toBe(5);
    expect(state.timerMinutes).toBe(10);
  });

  it('always forces enableBoleto to false even when config sets it true', () => {
    const state = createInitialCheckoutConfigState({ enableBoleto: true });
    expect(state.enableBoleto).toBe(false);
  });

  it('always forces enableBoleto to false when config sets it false', () => {
    const state = createInitialCheckoutConfigState({ enableBoleto: false });
    expect(state.enableBoleto).toBe(false);
  });

  it('merges partial config over defaults', () => {
    const input: CheckoutConfigInput = {
      checkoutName: 'My Checkout',
      enablePix: true,
      timerMinutes: 30,
    };
    const state = createInitialCheckoutConfigState(input);
    expect(state.checkoutName).toBe('My Checkout');
    expect(state.enablePix).toBe(true);
    expect(state.timerMinutes).toBe(30);
    // defaults preserved for unspecified keys
    expect(state.enableCreditCard).toBe(false);
    expect(state.chatDelay).toBe(5);
  });

  it('passes through arbitrary extra keys via spread', () => {
    const input: CheckoutConfigInput = {
      checkoutName: 'X',
      extraField: 'kept',
    } as CheckoutConfigInput;
    const state = createInitialCheckoutConfigState(input);
    expect(state.extraField).toBe('kept');
  });

  it('overrides defaults with provided chat values', () => {
    const state = createInitialCheckoutConfigState({
      chatEnabled: true,
      chatWelcomeMessage: 'Olá',
      chatPosition: 'bottom-left',
      chatColor: '#ff0000',
      chatOfferDiscount: true,
      chatDiscountCode: 'WELCOME10',
      chatSupportPhone: '+55 11 90000-0000',
      chatDelay: 7,
    });
    expect(state.chatEnabled).toBe(true);
    expect(state.chatWelcomeMessage).toBe('Olá');
    expect(state.chatPosition).toBe('bottom-left');
    expect(state.chatColor).toBe('#ff0000');
    expect(state.chatOfferDiscount).toBe(true);
    expect(state.chatDiscountCode).toBe('WELCOME10');
    expect(state.chatSupportPhone).toBe('+55 11 90000-0000');
    expect(state.chatDelay).toBe(7);
  });

  it('does not mutate the input config object', () => {
    const input: CheckoutConfigInput = { checkoutName: 'Original', enableBoleto: true };
    const snapshot = { ...input };
    createInitialCheckoutConfigState(input);
    expect(input).toEqual(snapshot);
  });

  it('handles empty object input', () => {
    const state = createInitialCheckoutConfigState({});
    expect(state.enableBoleto).toBe(false);
    expect(state.checkoutName).toBe('');
  });
});

describe('design-token constants', () => {
  it('exposes CSS variable fallback strings for backgrounds', () => {
    expect(VOID).toBe('var(--bg-void, colors.background.void)');
    expect(SURFACE).toBe('var(--bg-space, colors.background.surface)');
    expect(ELEVATED).toBe('var(--bg-nebula, colors.background.elevated)');
  });

  it('exposes border and text tokens', () => {
    expect(BORDER).toBe('var(--border-space, colors.border.space)');
    expect(TEXT).toBe('var(--text-starlight, colors.text.silver)');
    expect(SECONDARY).toBe('var(--text-moonlight, colors.text.muted)');
    expect(FAINT).toBe('var(--text-dust, colors.text.dim)');
    expect(TEXT_ON_ACCENT).toBe('var(--app-text-on-accent)');
  });

  it('exposes the EMBER accent token', () => {
    expect(EMBER).toBe('colors.ember.primary');
  });
});

describe('shared style objects', () => {
  it('sectionTitleStyle uses Sora 14px semibold', () => {
    expect(sectionTitleStyle.fontFamily).toBe("'Sora', sans-serif");
    expect(sectionTitleStyle.fontSize).toBe(14);
    expect(sectionTitleStyle.fontWeight).toBe(600);
    expect(sectionTitleStyle.color).toBe(TEXT);
    expect(sectionTitleStyle.marginBottom).toBe(16);
    expect(sectionTitleStyle.marginTop).toBe(0);
  });

  it('labelStyle is an uppercase compressed label', () => {
    expect(labelStyle.fontSize).toBe(10);
    expect(labelStyle.fontWeight).toBe(600);
    expect(labelStyle.textTransform).toBe('uppercase');
    expect(labelStyle.letterSpacing).toBe('0.06em');
    expect(labelStyle.display).toBe('block');
    expect(labelStyle.color).toBe(SECONDARY);
  });

  it('inputStyle uses 6px radius and surface bg', () => {
    expect(inputStyle.backgroundColor).toBe(SURFACE);
    expect(inputStyle.border).toBe(`1px solid ${BORDER}`);
    expect(inputStyle.borderRadius).toBe(6);
    expect(inputStyle.padding).toBe('10px 14px');
    expect(inputStyle.outline).toBe('none');
    expect(inputStyle.width).toBe('100%');
    expect(inputStyle.boxSizing).toBe('border-box');
  });

  it('textareaStyle extends inputStyle with vertical resize', () => {
    expect(textareaStyle.backgroundColor).toBe(SURFACE);
    expect(textareaStyle.minHeight).toBe(80);
    expect(textareaStyle.resize).toBe('vertical');
    expect(textareaStyle.lineHeight).toBe(1.5);
    // inherited from inputStyle
    expect(textareaStyle.borderRadius).toBe(6);
  });

  it('dividerStyle is a 1px BORDER horizontal rule', () => {
    expect(dividerStyle.height).toBe(1);
    expect(dividerStyle.backgroundColor).toBe(BORDER);
    expect(dividerStyle.border).toBe('none');
    expect(dividerStyle.margin).toBe('28px 0');
  });

  it('inputStyle and textareaStyle are distinct objects (no aliasing)', () => {
    expect(inputStyle).not.toBe(textareaStyle);
    // mutating one (hypothetically) must not affect the other — guard via shape only
    expect(inputStyle.minHeight).toBeUndefined();
    expect(textareaStyle.minHeight).toBe(80);
  });
});
