'use client';

import { API_BASE } from '@/lib/http';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SaleEntry {
  name: string;
  product: string;
  time: string;
}

interface SocialProofToastProps {
  enabled: boolean;
  productName: string;
  alerts?: Array<{ id: string; enabled: boolean; minQuantity?: number }>;
  customNames?: string;
}

export function SocialProofToast({ enabled }: SocialProofToastProps) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<SaleEntry | null>(null);
  const [hasSales, setHasSales] = useState(false);
  const salesRef = useRef<SaleEntry[]>([]);
  const indexRef = useRef(0);
  const fetchedRef = useRef(false);

  // Fetch real data once
  useEffect(() => {
    if (!enabled || fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`${API_BASE}/checkout/public/recent-sales?limit=5`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: SaleEntry[]) => {
        if (Array.isArray(data) && data.length > 0) {
          salesRef.current = data;
          setHasSales(true);
        }
      })
      .catch(() => {
        // No data available — component stays hidden
      });
  }, [enabled]);

  const showNext = useCallback(() => {
    const sales = salesRef.current;
    if (sales.length === 0) return;
    const entry = sales[indexRef.current % sales.length];
    indexRef.current++;
    setCurrent(entry);
    setVisible(true);
    setTimeout(() => setVisible(false), 4000);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // First toast after 5s
    const initial = setTimeout(showNext, 5000);

    // Subsequent toasts every 8-15s
    const interval = setInterval(() => {
      showNext();
    }, 12000);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [enabled, showNext]);

  // If env flag is off AND no real data, hide
  if (process.env.NEXT_PUBLIC_ENABLE_SOCIAL_PROOF !== 'true' && !hasSales) {
    return null;
  }

  if (!enabled || !visible || !current) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 90,
        maxWidth: 340,
        padding: '12px 16px',
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        animation: 'socialProofSlide 0.4s ease-out',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <style>{`
        @keyframes socialProofSlide {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #10B981, #059669)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <div
          style={{
            fontSize: 12,
            color: '#1A1714',
            fontWeight: 500,
            lineHeight: 1.4,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {current.name} comprou {current.product}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'rgba(0,0,0,0.35)',
            marginTop: 2,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {current.time} atras
        </div>
      </div>
    </div>
  );
}
