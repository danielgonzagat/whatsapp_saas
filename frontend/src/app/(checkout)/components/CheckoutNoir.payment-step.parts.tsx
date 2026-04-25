'use client';

/**
 * CheckoutNoir.payment-step.parts.tsx
 *
 * Thin re-export layer.  All component implementations live in
 * checkout-shared-parts.tsx.  This file adapts NoirColors/NoirInputTheme
 * into the shared theme slice each component expects.
 */

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
import type { NoirColors } from './CheckoutNoir.order-summary.parts';

export type { NoirColors };
export type NoirInputTheme = CheckoutThemeInputTokens;

export type NoirCardForm = {
  cardNumber: string;
  cardName: string;
  cardExp: string;
  cardCvv: string;
  cardCpf: string;
  installments: string;
};

export { Bc, Cc, Px };

export function NoirCardFields({
  fid,
  form,
  updateField,
  installmentOptions,
  pricing,
  inputTheme,
  C,
  L,
  fmt,
}: {
  fid: string;
  form: NoirCardForm;
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  installmentOptions: { value: string; label: string }[];
  pricing: { installmentInterestInCents: number };
  inputTheme: NoirInputTheme;
  C: NoirColors;
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
        mutedCardBackground: C.surface2,
        paymentBadgeBackground: C.surface2,
        paymentBadgeBorder: C.border,
        paymentBadgeText: C.text3,
        mutedText: C.text3,
        text: C.text,
        input: inputTheme,
      }}
      L={L}
      fmtFn={fmt}
    />
  );
}

export function NoirPixDetails({
  total,
  C,
  fmt,
}: {
  total: number;
  C: NoirColors;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <SharedPixDetails total={total} theme={{ text: C.text2, mutedText: C.text3 }} fmtFn={fmt} />
  );
}

export function NoirBoletoDetails({
  total,
  C,
  fmt,
}: {
  total: number;
  C: NoirColors;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <SharedBoletoDetails
      total={total}
      theme={{ text: C.text2, mutedText: C.text3, softMutedText: C.text3 }}
      fmtFn={fmt}
    />
  );
}
