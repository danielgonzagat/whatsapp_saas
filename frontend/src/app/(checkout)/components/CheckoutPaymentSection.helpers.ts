/**
 * CheckoutPaymentSection.helpers.ts
 *
 * Pure, side-effect-free helpers extracted from CheckoutPaymentSection.tsx
 * during Wave 113 decomposition. Keeps the host component focused on layout
 * while moving derivation logic into a framework-light, individually
 * testable module.
 *
 * Visual contract preservation: every helper here must produce the exact
 * same values the inline expressions returned. Padding, radii, font sizes,
 * weights and colours are part of the checkout visual contract and cannot
 * change without owner approval.
 */

import type * as React from 'react';
import type { PublicCheckoutConfig } from '@/lib/public-checkout-contract';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

/** Section card horizontal padding shared by active and locked states. */
const SECTION_CARD_PADDING = '24px 20px';
/** Reveal animation applied when the section becomes active. */
const SECTION_CARD_ANIMATION = 'fadeIn 0.3s';
/** Locked card opacity preserved verbatim from the original style. */
const LOCKED_CARD_OPACITY = 0.35;
/** Wider card radius used when the theme isn't asking for the slim 6px. */
const SECTION_CARD_RADIUS_WIDE = 12;
/** Slim card radius the noir theme opts into. */
const SECTION_CARD_RADIUS_SLIM = 6;
/** Label font size used by every form field within the section. */
const LABEL_FONT_SIZE = 14;
/** Label font weight used by every form field within the section. */
const LABEL_FONT_WEIGHT = 500;
/** Vertical gap between a label and its input control. */
const LABEL_MARGIN_BOTTOM = 6;
/** Top margin for the primary CTA button. */
const SUBMIT_BUTTON_MARGIN_TOP = 20;
/** Vertical padding for the primary CTA button. */
const SUBMIT_BUTTON_PADDING = 16;
/** Font size of the primary CTA button label. */
const SUBMIT_BUTTON_FONT_SIZE = 18;
/** Font weight of the primary CTA button label. */
const SUBMIT_BUTTON_FONT_WEIGHT = 700;
/** Default copy when no custom finalize button text is configured. */
const DEFAULT_FINALIZE_LABEL = 'Finalizar compra';
/** Copy shown while a submission is in flight. */
const PROCESSING_LABEL = 'Processando...';
/** Native form id suffix appended to the React-generated useId() base. */
const MANUAL_CARD_FORM_SUFFIX = '-card-form';
/** Padding around the installments select element. */
const INSTALLMENT_SELECT_PADDING = '13px 16px';
/** Installments select font size — matches the rest of the form. */
const INSTALLMENT_SELECT_FONT_SIZE = 15;
/** Font family used by every checkout select. */
const CHECKOUT_FONT_FAMILY = "'DM Sans', sans-serif";

/**
 * Resolve the radius used by the surrounding section card. The noir theme uses
 * the slim 6px radius; everything else gets the wider 12px radius.
 */
export function resolveSectionCardRadius(inputRadius: number): number {
  return inputRadius === SECTION_CARD_RADIUS_SLIM
    ? SECTION_CARD_RADIUS_SLIM
    : SECTION_CARD_RADIUS_WIDE;
}

/** Build the label CSS used by every form field in the payment section. */
export function buildLabelStyle(theme: CheckoutVisualTheme): React.CSSProperties {
  return {
    display: 'block',
    fontSize: LABEL_FONT_SIZE,
    fontWeight: LABEL_FONT_WEIGHT,
    color: theme.mode === 'NOIR' ? theme.mutedText : theme.text,
    marginBottom: LABEL_MARGIN_BOTTOM,
  };
}

/** Build the active section card style (the wrapper around the whole step). */
export function buildActiveCardStyle(theme: CheckoutVisualTheme): React.CSSProperties {
  return {
    background: theme.cardBackground,
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.cardShadow,
    borderRadius: resolveSectionCardRadius(theme.input.radius),
    padding: SECTION_CARD_PADDING,
    animation: SECTION_CARD_ANIMATION,
  };
}

/** Build the locked section card style (the dimmed pre-step state). */
export function buildLockedCardStyle(theme: CheckoutVisualTheme): React.CSSProperties {
  return { ...buildActiveCardStyle(theme), opacity: LOCKED_CARD_OPACITY };
}

/**
 * Predicate: is the user currently being driven through the Stripe Payment
 * Element flow? True only when card was selected AND the parent supplied both
 * a client secret and a return URL.
 */
export function usesStripePaymentElement(
  payMethod: 'card' | 'pix' | 'boleto',
  stripeClientSecret: string | null | undefined,
  stripeReturnUrl: string | undefined,
): boolean {
  return payMethod === 'card' && Boolean(stripeClientSecret && stripeReturnUrl);
}

/** Predicate: should the section show the inline submit error message? */
export function shouldShowSubmitError(submitError: string, step: number): boolean {
  return Boolean(submitError) && step === 3;
}

/** Predicate: is the section still locked (i.e. step < 3)? */
export function isSectionLocked(step: number): boolean {
  return step < 3;
}

/**
 * Compose the native form id used by the card form. Built from the React
 * useId() base + a stable suffix so the submit button's `form` attribute can
 * target it even when the button is rendered outside the form element.
 */
export function buildManualCardFormId(idBase: string): string {
  return `${idBase}${MANUAL_CARD_FORM_SUFFIX}`;
}

/** Resolve the submit button's HTML type from the active payment method. */
export function resolveSubmitButtonType(payMethod: 'card' | 'pix' | 'boleto'): 'submit' | 'button' {
  return payMethod === 'card' ? 'submit' : 'button';
}

/**
 * Resolve the submit button's `form` attribute. Only the card flow needs the
 * association because the button itself is rendered outside the manual form.
 */
export function resolveSubmitButtonFormId(
  payMethod: 'card' | 'pix' | 'boleto',
  manualCardFormId: string,
): string | undefined {
  return payMethod === 'card' ? manualCardFormId : undefined;
}

/**
 * Resolve the visible text of the primary CTA button. While a submission is
 * in flight we always show the processing copy; otherwise we honour the
 * configured override before falling back to the default Portuguese string.
 */
export function resolveSubmitButtonLabel(
  isSubmitting: boolean,
  config: PublicCheckoutConfig | undefined,
): string {
  if (isSubmitting) {
    return PROCESSING_LABEL;
  }
  return config?.btnFinalizeText || DEFAULT_FINALIZE_LABEL;
}

/** Build the primary CTA button style. */
export function buildSubmitButtonStyle(theme: CheckoutVisualTheme): React.CSSProperties {
  return {
    width: '100%',
    marginTop: SUBMIT_BUTTON_MARGIN_TOP,
    padding: SUBMIT_BUTTON_PADDING,
    background: theme.accent,
    border: 'none',
    borderRadius: theme.input.radius,
    color: theme.buttonText,
    fontSize: SUBMIT_BUTTON_FONT_SIZE,
    fontWeight: SUBMIT_BUTTON_FONT_WEIGHT,
  };
}

/** Build the installment <select> style used in the manual card form. */
export function buildInstallmentSelectStyle(theme: CheckoutVisualTheme): React.CSSProperties {
  return {
    width: '100%',
    padding: INSTALLMENT_SELECT_PADDING,
    background: theme.input.background,
    border: `1px solid ${theme.input.border}`,
    borderRadius: theme.input.radius,
    fontSize: INSTALLMENT_SELECT_FONT_SIZE,
    color: theme.text,
    fontFamily: CHECKOUT_FONT_FAMILY,
    outline: 'none',
  };
}
