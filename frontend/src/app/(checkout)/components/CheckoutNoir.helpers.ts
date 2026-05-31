/**
 * CheckoutNoir.helpers.ts
 *
 * Pure, side-effect-free helpers extracted from CheckoutNoir.tsx during
 * Wave 112 decomposition. Keeps the host component focused on layout while
 * locating derivation logic in a testable, framework-light module.
 *
 * Visual contract preservation: every helper here must return the exact same
 * values the inline expressions returned. Do not change defaults, opacity,
 * radius, padding or shadow values without updating the visual spec.
 */

import type * as React from 'react';
import type { PublicCheckoutThemeProps } from '@/lib/public-checkout-contract';
import type { NoirColors, NoirInputTheme } from './CheckoutNoir.order-summary';
import type { CheckoutThemeStepTokens } from './checkout-theme-shared';

/** Default colour seed for the noir checkout. Lives in CheckoutNoir.defaults. */
export type NoirDefaultColors = NoirColors;

/** Config slice the colour resolver reads from. */
export type NoirConfig = PublicCheckoutThemeProps['config'];

/** Stable size of every step number bubble in the noir layout. */
const STEP_BUBBLE_SIZE = 26;
/** Border radius for the step number bubble. */
const STEP_BUBBLE_RADIUS = '16%';
/** Card padding used by both active and locked summary cards. */
const STEP_CARD_PADDING = '24px 20px';
/** Slim card border radius shared across noir surfaces. */
const NOIR_CARD_RADIUS = 6;
/** Locked card opacity preserved from the original inline style. */
const LOCKED_CARD_OPACITY = 0.35;
/** Drop shadow applied to the active step card. */
const ACTIVE_CARD_SHADOW = '0 2px 12px rgba(0,0,0,0.3)';
/** Translucent emerald background for the "done" summary card. */
const DONE_CARD_BACKGROUND = 'rgba(16,185,129,0.04)';
/** Reveal animation used by the active card. */
const ACTIVE_CARD_ANIMATION = 'fadeIn 0.3s';

/**
 * Merge a CheckoutNoir config payload into the default colour map, preserving
 * the canonical fallback when a field is missing or empty.
 */
export function buildNoirColors(config: NoirConfig, defaults: NoirDefaultColors): NoirColors {
  return {
    ...defaults,
    void: config?.backgroundColor || defaults.void,
    surface: config?.cardColor || defaults.surface,
    text: config?.textColor || defaults.text,
    text2: config?.mutedTextColor || defaults.text2,
    accent: config?.accentColor || defaults.accent,
    accent2: config?.accentColor2 || config?.accentColor || defaults.accent2,
  };
}

/**
 * Derive the step indicator token bundle from the resolved colour map. Keeps
 * the active drop shadow proportional to the accent so theming stays coherent.
 */
export function buildStepTheme(C: NoirColors): CheckoutThemeStepTokens {
  return {
    activeBubbleBg: C.accent,
    lockedBubbleBg: C.surface2,
    activeLabelColor: C.text,
    lockedLabelColor: C.text3,
    activeShadow: `0 2px 12px ${C.accent}4d`,
    lineActive: C.green,
    lineInactive: C.border2,
  };
}

/** Derive the input chrome (background, border, focus glow) from the noir map. */
export function buildInputTheme(C: NoirColors): NoirInputTheme {
  return {
    background: C.surface2,
    border: C.border2,
    text: C.text,
    radius: NOIR_CARD_RADIUS,
    focusBorder: C.accent,
    focusShadow: `0 0 0 2px ${C.accent}26`,
    tagStroke: C.text3,
    editStroke: C.text3,
  };
}

/** Style shape for the three step-card variants and the three numeric bubble variants. */
export interface NoirStepCardStyles {
  doneCard: React.CSSProperties;
  activeCard: React.CSSProperties;
  lockedCard: React.CSSProperties;
  numDone: React.CSSProperties;
  numActive: React.CSSProperties;
  numLock: React.CSSProperties;
}

/** Build the static style bundle for the noir step cards/bubbles. */
export function buildStepCardStyles(C: NoirColors): NoirStepCardStyles {
  const doneCard: React.CSSProperties = {
    background: DONE_CARD_BACKGROUND,
    border: `1px solid ${C.border}`,
    borderRadius: NOIR_CARD_RADIUS,
    padding: 20,
  };

  const activeCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border2}`,
    boxShadow: ACTIVE_CARD_SHADOW,
    borderRadius: NOIR_CARD_RADIUS,
    padding: STEP_CARD_PADDING,
    animation: ACTIVE_CARD_ANIMATION,
  };

  const lockedCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: NOIR_CARD_RADIUS,
    padding: STEP_CARD_PADDING,
    opacity: LOCKED_CARD_OPACITY,
  };

  const numDone: React.CSSProperties = {
    width: STEP_BUBBLE_SIZE,
    height: STEP_BUBBLE_SIZE,
    borderRadius: STEP_BUBBLE_RADIUS,
    background: C.green,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const numActive: React.CSSProperties = {
    width: STEP_BUBBLE_SIZE,
    height: STEP_BUBBLE_SIZE,
    borderRadius: STEP_BUBBLE_RADIUS,
    background: C.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const numLock: React.CSSProperties = {
    width: STEP_BUBBLE_SIZE,
    height: STEP_BUBBLE_SIZE,
    borderRadius: STEP_BUBBLE_RADIUS,
    background: C.surface2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return { doneCard, activeCard, lockedCard, numDone, numActive, numLock };
}

/**
 * Coerce numeric installment-option values into strings so the noir payment
 * step (which uses string-based selects) can render them safely. Non-`value`
 * fields are preserved untouched and remain in the output type, so consumers
 * that require `label`, `monthly`, etc. continue to type-check.
 */
export function coerceInstallmentOptionsToString<
  T extends { value: number | string },
>(options: T[]): Array<Omit<T, 'value'> & { value: string }> {
  return options.map((option) => ({ ...option, value: String(option.value) }));
}

/** Capability flags used to decide whether a payment-method badge is visible. */
export interface NoirPaymentSupport {
  supportsCard: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
}

/**
 * Decide whether a given PAYMENT_BADGES entry should be rendered in the noir
 * footer. Pix / Boleto require explicit support; every other badge falls back
 * to the card-support flag.
 */
export function paymentBadgeIsVisible(code: string, support: NoirPaymentSupport): boolean {
  if (code === 'Pix') {
    return support.supportsPix;
  }
  if (code === 'Boleto') {
    return support.supportsBoleto;
  }
  return support.supportsCard;
}

/**
 * Decide which step bubble is reachable for keyboard / pointer activation.
 * Step 3 is always reachable once `step >= 3`; the lower steps use the
 * mobile gate flags so the same logic works on both viewports.
 */
export function resolveStepBubbleState(
  step: number,
  target: 1 | 2 | 3,
): 'active' | 'done' | 'locked' {
  if (target === 3) {
    return step >= 3 ? 'active' : 'locked';
  }
  if (step === target) {
    return 'active';
  }
  if (step > target) {
    return 'done';
  }
  return 'locked';
}
