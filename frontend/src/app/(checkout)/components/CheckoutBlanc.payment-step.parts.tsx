'use client';

/**
 * CheckoutBlanc.payment-step.parts.tsx
 *
 * Thin re-export layer.  All component implementations live in
 * checkout-shared-parts.tsx.  This file adapts BlancColors/BlancInputTheme
 * into the shared theme slice each component expects.
 */

import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import {
  Bc,
  BoletoDetails as SharedBoletoDetails,
  CardPaymentFields as SharedCardPaymentFields,
  Cc,
  PixDetails as SharedPixDetails,
  Px,
} from './checkout-shared-parts';
import type { CheckoutThemeInputTokens } from './checkout-theme-shared';
import type { BlancInputTheme } from './CheckoutBlanc.order-summary.parts';

export type BlancCardForm = {
  cardNumber: string;
  cardName: string;
  cardExp: string;
  cardCvv: string;
  cardCpf: string;
  installments: string;
};

// Legacy constant exports used directly by CheckoutBlanc.payment-step.tsx
export const BLANC_WHITE = UI.bg;
export const BLANC_MUTED = UI.muted;
export const BLANC_SOFT_LINE = UI.borderSoft;
export const BLANC_DARK = UI.text;
export const BLANC_STROKE = UI.borderSoft;

export { Bc, Cc, Px };

export function BlancCardPaymentFields({
  fid,
  form,
  updateField,
  installmentOptions,
  pricing,
  inputTheme,
  L,
  fmt,
}: {
  fid: string;
  form: BlancCardForm;
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  installmentOptions: { value: string; label: string }[];
  pricing: { installmentInterestInCents: number };
  inputTheme: BlancInputTheme;
  L: React.CSSProperties;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <SharedCardPaymentFields
      fid={fid}
      form={form}
      updateField={updateField}
      installmentOptions={installmentOptions}
      pricing={pricing}
      inputTheme={inputTheme}
      theme={{
        mutedCardBackground: UI.card,
        paymentBadgeBackground: UI.card,
        paymentBadgeBorder: UI.borderSoft,
        paymentBadgeText: UI.muted,
        mutedText: UI.muted,
        text: UI.text,
        input: inputTheme,
      }}
      L={L}
      fmtFn={fmt}
    />
  );
}

export function BlancPixDetails({
  total,
  fmt,
}: {
  total: number;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <SharedPixDetails total={total} theme={{ text: UI.text, mutedText: UI.muted }} fmtFn={fmt} />
  );
}

export function BlancBoletoDetails({
  total,
  fmt,
}: {
  total: number;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <SharedBoletoDetails
      total={total}
      theme={{ text: UI.text, mutedText: UI.muted, softMutedText: UI.muted }}
      fmtFn={fmt}
    />
  );
}
