'use client';

import { kloelT } from '@/lib/i18n/t';
import { Tag as SharedTag } from './checkout-theme-shared';
import type { NoirColors, NoirInputTheme } from './CheckoutNoir.order-summary';

interface NoirCouponPopupProps {
  popupCouponCode: string;
  couponError: string | null;
  C: NoirColors;
  inputTheme: NoirInputTheme;
  couponPopupTitle?: string;
  couponPopupDesc?: string;
  couponPopupDismiss?: string;
  couponPopupBtnText?: string;
  setShowCouponPopup: (v: boolean) => void;
  setCouponPopupHandled: (v: boolean) => void;
  applyCoupon: (code?: string) => Promise<void>;
}

export function NoirCouponPopup({
  popupCouponCode,
  couponError,
  C,
  inputTheme,
  couponPopupTitle,
  couponPopupDesc,
  couponPopupDismiss,
  couponPopupBtnText,
  setShowCouponPopup,
  setCouponPopupHandled,
  applyCoupon,
}: NoirCouponPopupProps) {
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
          background: C.surface,
          borderRadius: 6,
          border: `1px solid ${C.border2}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          padding: '28px 24px 22px',
          animation: 'modalIn 0.28s',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,rgba(212,165,116,0.18),rgba(232,196,160,0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <SharedTag stroke={inputTheme.tagStroke} />
        </div>
        <h3 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8 }}>
          {couponPopupTitle || 'Cupom exclusivo liberado'}
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: C.text2, marginBottom: 18 }}>
          {couponPopupDesc || 'Seu desconto já está pronto para ser aplicado neste pedido.'}
        </p>
        <div
          style={{
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,0.03)',
            padding: '14px 16px',
            marginBottom: 18,
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              color: C.text3,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {kloelT(`Cupom pronto para aplicar`)}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '.06em' }}>
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
              border: `1px solid ${C.border2}`,
              background: C.surface2,
              color: C.text2,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {couponPopupDismiss || 'Agora não'}
          </button>
          <button
            type="button"
            onClick={() => void applyCoupon(popupCouponCode)}
            style={{
              flex: 1.25,
              height: 48,
              borderRadius: 999,
              border: 'none',
              background: C.accent,
              color: C.void,
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {couponPopupBtnText || 'Aplicar cupom'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NoirSuccessModalProps {
  successOrderNumber: string | null;
  C: NoirColors;
}

export function NoirSuccessModal({ successOrderNumber, C }: NoirSuccessModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border2}`,
          borderRadius: 6,
          padding: '36px 32px',
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          animation: 'modalIn 0.3s',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: C.green,
            color: '#fff',
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
            stroke="#fff"
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
        <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6 }}>
          {kloelT(`Seu pedido foi realizado com sucesso.`)}
        </p>
        <div
          style={{
            marginTop: 16,
            padding: '10px 20px',
            background: 'rgba(16,185,129,0.08)',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            color: C.green,
            fontFamily: 'monospace',
          }}
        >
          {successOrderNumber || 'Pedido em processamento'}
        </div>
      </div>
    </div>
  );
}
