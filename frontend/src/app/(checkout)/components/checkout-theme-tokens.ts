'use client';

import type { CheckoutThemeInputTokens, CheckoutThemeStepTokens } from './checkout-theme-shared';
import { colors } from '@/lib/design-tokens';

/** Checkout visual theme shape. */
export interface CheckoutVisualTheme {
  /** Mode property. */
  mode: 'BLANC' | 'NOIR';
  /** Page background property. */
  pageBackground: string;
  /** Header background property. */
  headerBackground: string;
  /** Header text property. */
  headerText: string;
  /** Header muted text property. */
  headerMutedText: string;
  /** Sub header background property. */
  subHeaderBackground: string;
  /** Sub header border property. */
  subHeaderBorder: string;
  /** Sub header text property. */
  subHeaderText: string;
  /** Sub header muted text property. */
  subHeaderMutedText: string;
  /** Card background property. */
  cardBackground: string;
  /** Card border property. */
  cardBorder: string;
  /** Card shadow property. */
  cardShadow: string;
  /** Muted card background property. */
  mutedCardBackground: string;
  /** Text property. */
  text: string;
  /** Muted text property. */
  mutedText: string;
  /** Soft muted text property. */
  softMutedText: string;
  /** Divider property. */
  divider: string;
  /** Accent property. */
  accent: string;
  /** Accent secondary property. */
  accentSecondary: string;
  /** Success background property. */
  successBackground: string;
  /** Success border property. */
  successBorder: string;
  /** Success text property. */
  successText: string;
  /** Success badge background property. */
  successBadgeBackground: string;
  /** Field disabled background property. */
  fieldDisabledBackground: string;
  /** Field disabled text property. */
  fieldDisabledText: string;
  /** Phone prefix background property. */
  phonePrefixBackground: string;
  /** Phone prefix border property. */
  phonePrefixBorder: string;
  /** Phone prefix text property. */
  phonePrefixText: string;
  /** Quantity background property. */
  quantityBackground: string;
  /** Quantity text property. */
  quantityText: string;
  /** Summary background property. */
  summaryBackground: string;
  /** Total accent property. */
  totalAccent: string;
  /** Payment badge background property. */
  paymentBadgeBackground: string;
  /** Payment badge border property. */
  paymentBadgeBorder: string;
  /** Payment badge text property. */
  paymentBadgeText: string;
  /** Modal overlay property. */
  modalOverlay: string;
  /** Modal background property. */
  modalBackground: string;
  /** Modal text property. */
  modalText: string;
  /** Button text property. */
  buttonText: string;
  /** Spinner track property. */
  spinnerTrack: string;
  /** Spinner foreground property. */
  spinnerForeground: string;
  /** Social apple property. */
  socialApple: string;
  /** Social divider property. */
  socialDivider: string;
  /** Error text property. */
  errorText: string;
  /** Step property. */
  step: CheckoutThemeStepTokens;
  /** Input property. */
  input: CheckoutThemeInputTokens;
}

/** Checkout theme overrides type. */
export type CheckoutThemeOverrides = {
  accentColor?: string;
  accentColor2?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  mutedTextColor?: string;
};

const BLANC_BASE = {
  white: '#FFFFFF',
  dark: '#1A1A1A',
  muted: 'colors.text.muted',
  softMuted: 'rgba(110, 110, 115, 0.72)',
  stroke: 'rgba(58, 58, 63, 0.18)',
  softLine: 'rgba(58, 58, 63, 0.12)',
  surface: '#F5F5F5',
  surface2: 'rgba(255, 255, 255, 0.72)',
  successBg: 'rgba(16, 185, 129, 0.08)',
  successBorder: 'rgba(16, 185, 129, 0.24)',
  successText: 'rgb(22, 101, 52)',
  accent: 'colors.ember.primary',
  totalAccent: 'rgba(232, 93, 48, 0.72)',
} as const;

const NOIR_BASE = {
  void: 'colors.background.void',
  surface: 'colors.background.surface',
  surface2: 'colors.background.elevated',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.12)',
  text: 'colors.text.silver',
  text2: 'rgba(255,255,255,0.62)',
  text3: 'rgba(255,255,255,0.36)',
  accent: 'colors.ember.primary',
  accent2: 'rgba(232, 93, 48, 0.72)',
  successBg: 'rgba(16,185,129,0.14)',
  successBorder: 'rgba(134,239,172,0.32)',
  successText: 'rgb(134, 239, 172)',
} as const;

type BlancResolved = {
  accent: string;
  accentSecondary: string;
  background: string;
  cardBackground: string;
  text: string;
  mutedText: string;
};

function resolveBlanc(config?: CheckoutThemeOverrides): BlancResolved {
  const accent = config?.accentColor || BLANC_BASE.accent;
  return {
    accent,
    accentSecondary: config?.accentColor2 || accent,
    background: config?.backgroundColor || BLANC_BASE.surface,
    cardBackground: config?.cardColor || BLANC_BASE.white,
    text: config?.textColor || BLANC_BASE.dark,
    mutedText: config?.mutedTextColor || BLANC_BASE.muted,
  };
}

function buildBlancStep(accent: string): CheckoutThemeStepTokens {
  return {
    activeBubbleBg: BLANC_BASE.dark,
    lockedBubbleBg: BLANC_BASE.stroke,
    activeLabelColor: BLANC_BASE.dark,
    lockedLabelColor: BLANC_BASE.softMuted,
    activeShadow: '0 2px 10px rgba(0,0,0,0.2)',
    lineActive: accent,
    lineInactive: BLANC_BASE.softLine,
  };
}

function buildBlancInput(
  cardBackground: string,
  text: string,
  accent: string,
): CheckoutThemeInputTokens {
  return {
    background: cardBackground,
    border: BLANC_BASE.stroke,
    text,
    radius: 8,
    focusBorder: accent,
    focusShadow: '0 0 0 2px rgba(232, 93, 48, 0.12)',
    tagStroke: 'rgba(58, 58, 63, 0.4)',
    editStroke: 'rgba(58, 58, 63, 0.56)',
  };
}

/** Build blanc theme. */
export function buildBlancTheme(config?: CheckoutThemeOverrides): CheckoutVisualTheme {
  const r = resolveBlanc(config);

  return {
    mode: 'BLANC',
    pageBackground: r.background,
    headerBackground: BLANC_BASE.dark,
    headerText: BLANC_BASE.white,
    headerMutedText: 'rgba(255,255,255,0.68)',
    subHeaderBackground: 'rgba(255,255,255,0.68)',
    subHeaderBorder: BLANC_BASE.softLine,
    subHeaderText: BLANC_BASE.dark,
    subHeaderMutedText: BLANC_BASE.dark,
    cardBackground: r.cardBackground,
    cardBorder: BLANC_BASE.softLine,
    cardShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
    mutedCardBackground: BLANC_BASE.successBg,
    text: r.text,
    mutedText: r.mutedText,
    softMutedText: BLANC_BASE.softMuted,
    divider: BLANC_BASE.softLine,
    accent: r.accent,
    accentSecondary: r.accentSecondary,
    successBackground: BLANC_BASE.successBg,
    successBorder: BLANC_BASE.successBorder,
    successText: BLANC_BASE.successText,
    successBadgeBackground: r.accent,
    fieldDisabledBackground: BLANC_BASE.surface2,
    fieldDisabledText: BLANC_BASE.muted,
    phonePrefixBackground: BLANC_BASE.surface2,
    phonePrefixBorder: BLANC_BASE.stroke,
    phonePrefixText: BLANC_BASE.muted,
    quantityBackground: 'rgba(58, 58, 63, 0.06)',
    quantityText: r.text,
    summaryBackground: 'rgba(58, 58, 63, 0.06)',
    totalAccent: BLANC_BASE.totalAccent,
    paymentBadgeBackground: 'rgba(58, 58, 63, 0.06)',
    paymentBadgeBorder: 'rgba(58, 58, 63, 0.12)',
    paymentBadgeText: BLANC_BASE.muted,
    modalOverlay: 'rgba(0,0,0,0.4)',
    modalBackground: BLANC_BASE.white,
    modalText: r.text,
    buttonText: BLANC_BASE.white,
    spinnerTrack: 'rgba(255,255,255,0.3)',
    spinnerForeground: BLANC_BASE.white,
    socialApple: BLANC_BASE.dark,
    socialDivider: BLANC_BASE.softLine,
    errorText: 'rgb(209, 67, 67)',
    step: buildBlancStep(r.accent),
    input: buildBlancInput(r.cardBackground, r.text, r.accent),
  };
}

type NoirResolved = {
  accent: string;
  accentSecondary: string;
  background: string;
  cardBackground: string;
  text: string;
  mutedText: string;
};

function resolveNoir(config?: CheckoutThemeOverrides): NoirResolved {
  const accent = config?.accentColor || NOIR_BASE.accent;
  return {
    accent,
    accentSecondary: config?.accentColor2 || accent,
    background: config?.backgroundColor || NOIR_BASE.void,
    cardBackground: config?.cardColor || NOIR_BASE.surface,
    text: config?.textColor || NOIR_BASE.text,
    mutedText: config?.mutedTextColor || NOIR_BASE.text2,
  };
}

function buildNoirStep(accent: string, text: string): CheckoutThemeStepTokens {
  return {
    activeBubbleBg: accent,
    lockedBubbleBg: NOIR_BASE.surface2,
    activeLabelColor: text,
    lockedLabelColor: NOIR_BASE.text3,
    activeShadow: `0 2px 12px ${accent}4d`,
    lineActive: accent,
    lineInactive: NOIR_BASE.border2,
  };
}

function buildNoirInput(accent: string, text: string): CheckoutThemeInputTokens {
  return {
    background: NOIR_BASE.surface2,
    border: NOIR_BASE.border2,
    text,
    radius: 6,
    focusBorder: accent,
    focusShadow: '0 0 0 2px rgba(232, 93, 48, 0.14)',
    tagStroke: NOIR_BASE.text3,
    editStroke: NOIR_BASE.text3,
  };
}

/** Build noir theme. */
export function buildNoirTheme(config?: CheckoutThemeOverrides): CheckoutVisualTheme {
  const r = resolveNoir(config);

  return {
    mode: 'NOIR',
    pageBackground: r.background,
    headerBackground: NOIR_BASE.surface,
    headerText: NOIR_BASE.text,
    headerMutedText: NOIR_BASE.text2,
    subHeaderBackground: NOIR_BASE.surface2,
    subHeaderBorder: NOIR_BASE.border,
    subHeaderText: NOIR_BASE.accent2,
    subHeaderMutedText: NOIR_BASE.text2,
    cardBackground: r.cardBackground,
    cardBorder: NOIR_BASE.border2,
    cardShadow: '0 2px 12px rgba(0,0,0,0.3)',
    mutedCardBackground: 'rgba(16,185,129,0.04)',
    text: r.text,
    mutedText: r.mutedText,
    softMutedText: NOIR_BASE.text3,
    divider: NOIR_BASE.border2,
    accent: r.accent,
    accentSecondary: r.accentSecondary,
    successBackground: NOIR_BASE.successBg,
    successBorder: NOIR_BASE.successBorder,
    successText: NOIR_BASE.successText,
    successBadgeBackground: r.accent,
    fieldDisabledBackground: 'rgba(255, 255, 255, 0.06)',
    fieldDisabledText: NOIR_BASE.text2,
    phonePrefixBackground: NOIR_BASE.surface2,
    phonePrefixBorder: NOIR_BASE.border2,
    phonePrefixText: NOIR_BASE.text2,
    quantityBackground: NOIR_BASE.surface2,
    quantityText: r.text,
    summaryBackground: NOIR_BASE.surface2,
    totalAccent: r.accent,
    paymentBadgeBackground: NOIR_BASE.surface2,
    paymentBadgeBorder: NOIR_BASE.border2,
    paymentBadgeText: NOIR_BASE.text2,
    modalOverlay: 'rgba(0,0,0,0.56)',
    modalBackground: NOIR_BASE.surface,
    modalText: r.text,
    buttonText: NOIR_BASE.void,
    spinnerTrack: 'rgba(0,0,0,0.2)',
    spinnerForeground: NOIR_BASE.void,
    socialApple: 'rgb(255, 255, 255)',
    socialDivider: NOIR_BASE.border2,
    errorText: 'rgb(248, 113, 113)',
    step: buildNoirStep(r.accent, r.text),
    input: buildNoirInput(r.accent, r.text),
  };
}
