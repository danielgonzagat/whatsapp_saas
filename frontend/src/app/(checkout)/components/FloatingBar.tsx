'use client';

import { useEffect, useState } from 'react';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface FloatingBarProps {
  enabled: boolean;
  message?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function FloatingBar({
  enabled,
  message = 'Compra 100% segura e protegida',
  accentColor = '#D4AF37',
  textColor = '#E8E6E1',
  backgroundColor = '#141416',
}: FloatingBarProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled || dismissed) return;
    const onScroll = () => {
      const scrollPercent =
        window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      setVisible(scrollPercent > 0.3);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled, dismissed]);

  if (!enabled || !visible || dismissed) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div
      style={{
        position: 'fixed',
        [isMobile ? 'bottom' : 'top']: 0,
        left: 0,
        right: 0,
        zIndex: 9990,
        background: backgroundColor,
        borderTop: isMobile ? `1px solid ${accentColor}30` : 'none',
        borderBottom: isMobile ? 'none' : `1px solid ${accentColor}30`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        boxShadow: isMobile ? '0 -2px 12px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* Lock icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={accentColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span style={{ fontSize: '13px', color: textColor, fontWeight: 500 }}>{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          color: `${textColor}66`,
          fontSize: '18px',
          cursor: 'pointer',
          marginLeft: '8px',
          lineHeight: 1,
        }}
        aria-label="Fechar"
      >
        &times;
      </button>
    </div>
  );
}
