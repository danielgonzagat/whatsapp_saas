'use client';

import { kloelT } from '@/lib/i18n/t';
import { Tag as SharedTag } from './checkout-theme-shared';
import type { BlancColors, BlancInputTheme } from './CheckoutBlanc.order-summary';

const BLANC_WHITE = '#ffffff';
const BLANC_SOFT_LINE = '#e5e7eb';

interface CouponPopupProps {
  popupCouponCode: string;
  couponError: string | null;
  setShowCouponPopup: (v: boolean) => void;
  setCouponPopupHandled: (v: boolean) => void;
  applyCoupon: (code?: string) => Promise<void>;
  colors: BlancColors;
  inputTheme: BlancInputTheme;
  couponPopupTitle?: string;
  couponPopupDesc?: string;
  couponPopupDismiss?: string;
  couponPopupBtnText?: string;
}

export function BlancCouponPopup({
  popupCouponCode,
  couponError,
  setShowCouponPopup,
  setCouponPopupHandled,
  applyCoupon,
  colors,
  inputTheme,
  couponPopupTitle,
  couponPopupDesc,
  couponPopupDismiss,
  couponPopupBtnText,
}: CouponPopupProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(12,12,14,0.38)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: BLANC_WHITE,
          borderRadius: 18,
          border: '1px solid rgba(17,24,39,0.08)',
          boxShadow: '0 24px 80px rgba(15,23,42,0.18)',
          padding: '28px 24px 22px',
          animation: 'modalIn 0.28s',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#f4efe8,#efe6d8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <SharedTag stroke={inputTheme.tagStroke} />
        </div>
        <h3 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>
          {couponPopupTitle ?? 'Cupom exclusivo liberado'}
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#666', marginBottom: 18 }}>
          {couponPopupDesc ?? 'Seu desconto já está pronto para ser aplicado neste pedido.'}
        </p>
        <div
          style={{
            borderRadius: 14,
            border: '1px solid #ece7df',
            background: '#faf7f2',
            padding: '14px 16px',
            marginBottom: 18,
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: '#8a8176',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {kloelT(`Cupom pronto para aplicar`)}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', letterSpacing: '.06em' }}>
            {popupCouponCode}
          </span>
        </div>
        {couponError ? (
          <div style={{ fontSize: 12, color: '#d14343', marginBottom: 12, lineHeight: 1.6 }}>
            {couponError}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              setShowCouponPopup(false);
              setCouponPopupHandled(true);
            }}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 999,
              border: `1px solid ${BLANC_SOFT_LINE}`,
              background: BLANC_WHITE,
              color: '#666',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {couponPopupDismiss ?? 'Agora não'}
          </button>
          <button
            type="button"
            onClick={() => void applyCoupon(popupCouponCode)}
            style={{
              flex: 1.25,
              height: 48,
              borderRadius: 999,
              border: 'none',
              background: colors.accent,
              color: BLANC_WHITE,
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {couponPopupBtnText ?? 'Aplicar cupom'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SuccessModalProps {
  successOrderNumber: string | null;
  accentColor: string;
}

export function BlancSuccessModal({ successOrderNumber, accentColor }: SuccessModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: BLANC_WHITE,
          borderRadius: 16,
          padding: '36px 32px',
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          animation: 'modalIn 0.3s',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: accentColor,
            color: BLANC_WHITE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke={BLANC_WHITE}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>
          {kloelT(`Pedido confirmado!`)}
        </h3>
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
          {kloelT(`Seu pedido foi realizado com sucesso.`)}
        </p>
        <div
          style={{
            marginTop: 16,
            padding: '10px 20px',
            background: '#f0fdf4',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: accentColor,
            fontFamily: 'monospace',
          }}
        >
          {successOrderNumber ?? 'Pedido em processamento'}
        </div>
      </div>
    </div>
  );
}
