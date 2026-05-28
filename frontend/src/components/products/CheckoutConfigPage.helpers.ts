import type { CSSProperties } from 'react';

/**
 * Pure helpers + design-token constants extracted from CheckoutConfigPage.
 *
 * These are framework-agnostic values and the deterministic
 * `createInitialCheckoutConfigState` initializer, kept separate from the
 * React component for unit-testability and reuse.
 */

export interface CheckoutConfigState {
  checkoutName: string;
  enableBoleto: boolean;
  enableCreditCard: boolean;
  enablePix: boolean;
  chatEnabled: boolean;
  chatWelcomeMessage: string;
  chatDelay: number;
  chatPosition: string;
  chatColor: string;
  chatOfferDiscount: boolean;
  chatDiscountCode: string;
  chatSupportPhone: string;
  enableCoupon: boolean;
  enableTimer: boolean;
  timerMinutes: number;
  timerMessage: string;
  socialProofEnabled: boolean;
  socialProofCustomNames: string;
  enableSteps: boolean;
  [key: string]: unknown;
}

export interface CheckoutConfigInput extends Partial<CheckoutConfigState> {
  id?: string;
}

/**
 * Build the initial controlled-form state from an optional partial config.
 *
 * Boleto is always reset to `false` regardless of the incoming config — boleto
 * is intentionally disabled by the product spec for new checkout configs.
 */
export function createInitialCheckoutConfigState(
  config: CheckoutConfigInput | null | undefined,
): CheckoutConfigState {
  const safeConfig = config ?? {};
  return {
    checkoutName: '',
    enableCreditCard: false,
    enablePix: false,
    chatEnabled: false,
    chatWelcomeMessage: '',
    chatDelay: 5,
    chatPosition: 'bottom-right',
    chatColor: 'colors.ember.primary',
    chatOfferDiscount: false,
    chatDiscountCode: '',
    chatSupportPhone: '',
    enableCoupon: false,
    enableTimer: false,
    timerMinutes: 10,
    timerMessage: '',
    socialProofEnabled: false,
    socialProofCustomNames: '',
    enableSteps: false,
    ...safeConfig,
    enableBoleto: false,
  };
}

/* ── Design Tokens ── */

export const VOID = 'var(--bg-void, colors.background.void)';
export const SURFACE = 'var(--bg-space, colors.background.surface)';
export const ELEVATED = 'var(--bg-nebula, colors.background.elevated)';
export const BORDER = 'var(--border-space, colors.border.space)';
export const TEXT = 'var(--text-starlight, colors.text.silver)';
export const SECONDARY = 'var(--text-moonlight, colors.text.muted)';
export const FAINT = 'var(--text-dust, colors.text.dim)';
export const TEXT_ON_ACCENT = 'var(--app-text-on-accent)';
export const EMBER = 'colors.ember.primary';

/* ── Shared Styles ── */

export const sectionTitleStyle: CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 14,
  fontWeight: 600,
  color: TEXT,
  marginBottom: 16,
  marginTop: 0,
};

export const labelStyle: CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 10,
  fontWeight: 600,
  color: SECONDARY,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
};

export const inputStyle: CSSProperties = {
  backgroundColor: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '10px 14px',
  color: TEXT,
  fontSize: 13,
  fontFamily: "'Sora', sans-serif",
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: 'vertical',
  lineHeight: 1.5,
};

export const dividerStyle: CSSProperties = {
  height: 1,
  backgroundColor: BORDER,
  border: 'none',
  margin: '28px 0',
};
