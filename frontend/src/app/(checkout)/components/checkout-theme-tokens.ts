'use client';

import type { CheckoutThemeInputTokens, CheckoutThemeStepTokens } from './checkout-theme-shared';

export interface CheckoutVisualTheme {
  mode: 'BLANC' | 'NOIR';
  pageBackground: string;
  headerBackground: string;
  headerText: string;
  headerMutedText: string;
  subHeaderBackground: string;
  subHeaderBorder: string;
  subHeaderText: string;
  subHeaderMutedText: string;
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  mutedCardBackground: string;
  text: string;
  mutedText: string;
  softMutedText: string;
  divider: string;
  accent: string;
  accentSecondary: string;
  successBackground: string;
  successBorder: string;
  successText: string;
  successBadgeBackground: string;
  fieldDisabledBackground: string;
  fieldDisabledText: string;
  phonePrefixBackground: string;
  phonePrefixBorder: string;
  phonePrefixText: string;
  quantityBackground: string;
  quantityText: string;
  summaryBackground: string;
  totalAccent: string;
  paymentBadgeBackground: string;
  paymentBadgeBorder: string;
  paymentBadgeText: string;
  modalOverlay: string;
  modalBackground: string;
  modalText: string;
  buttonText: string;
  spinnerTrack: string;
  spinnerForeground: string;
  socialApple: string;
  socialDivider: string;
  errorText: string;
  step: CheckoutThemeStepTokens;
  input: CheckoutThemeInputTokens;
}

const BLANC_BASE = {
  white: '#FFFFFF',
  dark: '#1A1A1A',
  muted: '#6E6E73',
  softMuted: 'rgba(110, 110, 115, 0.72)',
  stroke: 'rgba(58, 58, 63, 0.18)',
  softLine: 'rgba(58, 58, 63, 0.12)',
  surface: '#F5F5F5',
  surface2: 'rgba(255, 255, 255, 0.72)',
  successBg: 'rgba(16, 185, 129, 0.08)',
  successBorder: 'rgba(16, 185, 129, 0.24)',
  successText: 'rgb(22, 101, 52)',
  accent: '#E85D30',
  totalAccent: 'rgba(232, 93, 48, 0.72)',
} as const;

const NOIR_BASE = {
  void: '#0A0A0C',
  surface: '#111113',
  surface2: '#19191C',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.12)',
  text: '#E0DDD8',
  text2: 'rgba(255,255,255,0.62)',
  text3: 'rgba(255,255,255,0.36)',
  accent: '#E85D30',
  accent2: 'rgba(232, 93, 48, 0.72)',
  successBg: 'rgba(16,185,129,0.14)',
  successBorder: 'rgba(134,239,172,0.32)',
  successText: 'rgb(134, 239, 172)',
} as const;

export function buildBlancTheme(config?: {
  accentColor?: string;
  accentColor2?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  mutedTextColor?: string;
}): CheckoutVisualTheme {
  const accent = config?.accentColor || BLANC_BASE.accent;
  const cardBackground = config?.cardColor || BLANC_BASE.white;
  const text = config?.textColor || BLANC_BASE.dark;
  const mutedText = config?.mutedTextColor || BLANC_BASE.muted;

  return {
    mode: 'BLANC',
    pageBackground: config?.backgroundColor || BLANC_BASE.surface,
    headerBackground: BLANC_BASE.dark,
    headerText: BLANC_BASE.white,
    headerMutedText: 'rgba(255,255,255,0.68)',
    subHeaderBackground: 'rgba(255,255,255,0.68)',
    subHeaderBorder: BLANC_BASE.softLine,
    subHeaderText: BLANC_BASE.dark,
    subHeaderMutedText: BLANC_BASE.dark,
    cardBackground,
    cardBorder: BLANC_BASE.softLine,
    cardShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
    mutedCardBackground: BLANC_BASE.successBg,
    text,
    mutedText,
    softMutedText: BLANC_BASE.softMuted,
    divider: BLANC_BASE.softLine,
    accent,
    accentSecondary: config?.accentColor2 || accent,
    successBackground: BLANC_BASE.successBg,
    successBorder: BLANC_BASE.successBorder,
    successText: BLANC_BASE.successText,
    successBadgeBackground: accent,
    fieldDisabledBackground: BLANC_BASE.surface2,
    fieldDisabledText: BLANC_BASE.muted,
    phonePrefixBackground: BLANC_BASE.surface2,
    phonePrefixBorder: BLANC_BASE.stroke,
    phonePrefixText: BLANC_BASE.muted,
    quantityBackground: 'rgba(58, 58, 63, 0.06)',
    quantityText: text,
    summaryBackground: 'rgba(58, 58, 63, 0.06)',
    totalAccent: BLANC_BASE.totalAccent,
    paymentBadgeBackground: 'rgba(58, 58, 63, 0.06)',
    paymentBadgeBorder: 'rgba(58, 58, 63, 0.12)',
    paymentBadgeText: BLANC_BASE.muted,
    modalOverlay: 'rgba(0,0,0,0.4)',
    modalBackground: BLANC_BASE.white,
    modalText: text,
    buttonText: BLANC_BASE.white,
    spinnerTrack: 'rgba(255,255,255,0.3)',
    spinnerForeground: BLANC_BASE.white,
    socialApple: BLANC_BASE.dark,
    socialDivider: BLANC_BASE.softLine,
    errorText: 'rgb(209, 67, 67)',
    step: {
      activeBubbleBg: BLANC_BASE.dark,
      lockedBubbleBg: BLANC_BASE.stroke,
      activeLabelColor: BLANC_BASE.dark,
      lockedLabelColor: BLANC_BASE.softMuted,
      activeShadow: '0 2px 10px rgba(0,0,0,0.2)',
      lineActive: accent,
      lineInactive: BLANC_BASE.softLine,
    },
    input: {
      background: cardBackground,
      border: BLANC_BASE.stroke,
      text,
      radius: 8,
      focusBorder: accent,
      focusShadow: '0 0 0 2px rgba(232, 93, 48, 0.12)',
      tagStroke: 'rgba(58, 58, 63, 0.4)',
      editStroke: 'rgba(58, 58, 63, 0.56)',
    },
  };
}

export function buildNoirTheme(config?: {
  accentColor?: string;
  accentColor2?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  mutedTextColor?: string;
}): CheckoutVisualTheme {
  const accent = config?.accentColor || NOIR_BASE.accent;
  const text = config?.textColor || NOIR_BASE.text;

  return {
    mode: 'NOIR',
    pageBackground: config?.backgroundColor || NOIR_BASE.void,
    headerBackground: NOIR_BASE.surface,
    headerText: NOIR_BASE.text,
    headerMutedText: NOIR_BASE.text2,
    subHeaderBackground: NOIR_BASE.surface2,
    subHeaderBorder: NOIR_BASE.border,
    subHeaderText: NOIR_BASE.accent2,
    subHeaderMutedText: NOIR_BASE.text2,
    cardBackground: config?.cardColor || NOIR_BASE.surface,
    cardBorder: NOIR_BASE.border2,
    cardShadow: '0 2px 12px rgba(0,0,0,0.3)',
    mutedCardBackground: 'rgba(16,185,129,0.04)',
    text,
    mutedText: config?.mutedTextColor || NOIR_BASE.text2,
    softMutedText: NOIR_BASE.text3,
    divider: NOIR_BASE.border2,
    accent,
    accentSecondary: config?.accentColor2 || accent,
    successBackground: NOIR_BASE.successBg,
    successBorder: NOIR_BASE.successBorder,
    successText: NOIR_BASE.successText,
    successBadgeBackground: accent,
    fieldDisabledBackground: 'rgba(255, 255, 255, 0.06)',
    fieldDisabledText: NOIR_BASE.text2,
    phonePrefixBackground: NOIR_BASE.surface2,
    phonePrefixBorder: NOIR_BASE.border2,
    phonePrefixText: NOIR_BASE.text2,
    quantityBackground: NOIR_BASE.surface2,
    quantityText: text,
    summaryBackground: NOIR_BASE.surface2,
    totalAccent: accent,
    paymentBadgeBackground: NOIR_BASE.surface2,
    paymentBadgeBorder: NOIR_BASE.border2,
    paymentBadgeText: NOIR_BASE.text2,
    modalOverlay: 'rgba(0,0,0,0.56)',
    modalBackground: NOIR_BASE.surface,
    modalText: text,
    buttonText: NOIR_BASE.void,
    spinnerTrack: 'rgba(0,0,0,0.2)',
    spinnerForeground: NOIR_BASE.void,
    socialApple: 'rgb(255, 255, 255)',
    socialDivider: NOIR_BASE.border2,
    errorText: 'rgb(248, 113, 113)',
    step: {
      activeBubbleBg: accent,
      lockedBubbleBg: NOIR_BASE.surface2,
      activeLabelColor: text,
      lockedLabelColor: NOIR_BASE.text3,
      activeShadow: `0 2px 12px ${accent}4d`,
      lineActive: accent,
      lineInactive: NOIR_BASE.border2,
    },
    input: {
      background: NOIR_BASE.surface2,
      border: NOIR_BASE.border2,
      text,
      radius: 6,
      focusBorder: accent,
      focusShadow: '0 0 0 2px rgba(232, 93, 48, 0.14)',
      tagStroke: NOIR_BASE.text3,
      editStroke: NOIR_BASE.text3,
    },
  };
}
