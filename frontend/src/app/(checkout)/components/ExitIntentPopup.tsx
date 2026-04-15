'use client';

import { useCallback, useEffect, useState } from 'react';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface ExitIntentPopupProps {
  enabled: boolean;
  title?: string;
  description?: string;
  couponCode?: string;
  onApplyCoupon?: (code: string) => void;
  accentColor?: string;
  textColor?: string;
  cardColor?: string;
}

const STORAGE_KEY = 'ck_exit_intent_shown';

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function ExitIntentPopup({
  enabled,
  title = 'Espere! Temos um presente para voce',
  description = 'Use o cupom abaixo e garanta um desconto especial.',
  couponCode,
  onApplyCoupon,
  accentColor = '#D4AF37',
  textColor = '#E8E6E1',
  cardColor = '#141416',
}: ExitIntentPopupProps) {
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => {
    if (!enabled || !couponCode) return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private browsing */
    }
    setVisible(true);
  }, [enabled, couponCode]);

  /* Desktop: cursor leaves viewport from the top */
  useEffect(() => {
    if (!enabled || !couponCode) return;
    const handler = (e: MouseEvent) => {
      if (e.clientY <= 0) show();
    };
    document.addEventListener('mouseout', handler);
    return () => document.removeEventListener('mouseout', handler);
  }, [enabled, couponCode, show]);

  /* Mobile: show after 60s + scroll up */
  useEffect(() => {
    if (!enabled || !couponCode) return;
    let scrollY = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      const currentY = window.scrollY;
      if (currentY < scrollY - 50) {
        show();
      }
      scrollY = currentY;
    };

    timer = setTimeout(() => {
      window.addEventListener('scroll', onScroll, { passive: true });
    }, 60000);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled, couponCode, show]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: cardColor,
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          border: `1px solid ${accentColor}22`,
        }}
      >
        <div style={{ fontSize: '36px', marginBottom: '16px' }}>&#127873;</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: textColor, marginBottom: '8px' }}>
          {title}
        </div>
        <div
          style={{
            fontSize: '14px',
            color: `${textColor}99`,
            lineHeight: 1.5,
            marginBottom: '20px',
          }}
        >
          {description}
        </div>
        <div
          style={{
            background: `${accentColor}15`,
            borderRadius: '8px',
            padding: '12px',
            fontSize: '18px',
            fontWeight: 700,
            color: accentColor,
            letterSpacing: '2px',
            marginBottom: '20px',
            border: `1px dashed ${accentColor}40`,
          }}
        >
          {couponCode}
        </div>
        <button
          type="button"
          onClick={() => {
            onApplyCoupon?.(couponCode!);
            setVisible(false);
          }}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            background: accentColor,
            color: '#000',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          Aplicar cupom
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          style={{
            background: 'none',
            border: 'none',
            color: `${textColor}66`,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Nao, obrigado
        </button>
      </div>
    </div>
  );
}
