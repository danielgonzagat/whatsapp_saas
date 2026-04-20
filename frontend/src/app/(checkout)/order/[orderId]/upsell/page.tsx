'use client';

import { kloelT } from '@/lib/i18n/t';
import { API_BASE } from '@/lib/http';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { acceptUpsell, declineUpsell } from '../../../hooks/useCheckout';
import {
  formatBRL,
  formatTime,
  parseUpsellsQuery,
  type OrderUpsellsResponse,
  type UpsellData,
} from './upsell.helpers';

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function UpsellPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.orderId as string;

  const [upsells, setUpsells] = useState<UpsellData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const font = "'DM Sans', sans-serif";
  const accent = '#22c55e';

  // Load upsells from query or API
  useEffect(() => {
    const parsed = parseUpsellsQuery(searchParams.get('upsells'));
    if (parsed) {
      setUpsells(parsed);
      setLoading(false);
      return;
    }

    // Fallback: fetch from API
    fetch(`${API_BASE}/checkout/public/order/${orderId}/status`)
      .then((r) => r.json())
      .then((data: OrderUpsellsResponse) => {
        if (data.upsells?.length) {
          setUpsells(data.upsells);
          setCurrentIndex(data.currentIndex || 0);
        } else {
          router.push(`/order/${orderId}/success`);
        }
        setLoading(false);
      })
      .catch(() => {
        router.push(`/order/${orderId}/success`);
      });
  }, [orderId, searchParams, router]);

  const currentUpsell = upsells[currentIndex] || null;

  // Timer
  useEffect(() => {
    if (!currentUpsell?.timerSeconds) {
      setCountdown(null);
      return;
    }
    setCountdown(currentUpsell.timerSeconds);
  }, [currentUpsell]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      return;
    }
    const t = setInterval(
      () => setCountdown((prev) => (prev !== null ? Math.max(prev - 1, 0) : null)),
      1000,
    );
    return () => clearInterval(t);
  }, [countdown]);

  const goNext = useCallback(() => {
    if (currentIndex < upsells.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSubmitting(false);
    } else {
      router.push(`/order/${orderId}/success`);
    }
  }, [currentIndex, upsells.length, orderId, router]);

  const handleAccept = useCallback(async () => {
    if (!currentUpsell || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await acceptUpsell(orderId, currentUpsell.id);
    } catch {
      // Continue even if API fails — better UX
    }
    goNext();
  }, [currentUpsell, orderId, submitting, goNext]);

  const handleDecline = useCallback(async () => {
    if (!currentUpsell || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await declineUpsell(orderId, currentUpsell.id);
    } catch {
      // Continue
    }
    goNext();
  }, [currentUpsell, orderId, submitting, goNext]);

  /* ─── Loading ─────────────────────────────────────────────────────────── */

  if (loading || !currentUpsell) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A0A0C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: font,
        }}
      >
        <div style={{ color: '#8A8A8E', fontSize: '14px' }}>{kloelT(`Carregando oferta...`)}</div>
      </div>
    );
  }

  /* ─── Render ──────────────────────────────────────────────────────────── */

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0A0C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font,
        padding: '24px 16px',
      }}
    >
      <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
        {/* Timer */}
        {countdown !== null && countdown > 0 && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#2A1A1A',
              border: '1px solid #ef444444',
              borderRadius: '10px',
              padding: '8px 16px',
              marginBottom: '20px',
              color: '#ef4444',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            {kloelT(`Oferta expira em`)} {formatTime(countdown)}
          </div>
        )}

        {/* Headline */}
        <h1
          style={{
            color: '#E8E6E1',
            fontSize: '28px',
            fontWeight: 700,
            margin: '0 0 8px',
            lineHeight: '1.3',
          }}
        >
          {currentUpsell.headline}
        </h1>
        <p style={{ color: '#8A8A8E', fontSize: '14px', margin: '0 0 24px', lineHeight: '1.5' }}>
          {currentUpsell.description}
        </p>

        {/* Product image */}
        {currentUpsell.image && (
          <div style={{ marginBottom: '24px' }}>
            <Image
              src={currentUpsell.image}
              alt={currentUpsell.productName}
              width={560}
              height={280}
              unoptimized
              style={{
                maxWidth: '100%',
                maxHeight: '280px',
                borderRadius: '16px',
                objectFit: 'cover',
              }}
            />
          </div>
        )}

        {/* Product name */}
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#E8E6E1', marginBottom: '12px' }}>
          {currentUpsell.productName}
        </div>

        {/* Price comparison */}
        <div style={{ marginBottom: '24px' }}>
          {currentUpsell.compareAtPrice != null && (
            <div style={{ fontSize: '14px', color: '#8A8A8E' }}>
              de{' '}
              <span style={{ textDecoration: 'line-through' }}>
                {formatBRL(currentUpsell.compareAtPrice)}
              </span>
            </div>
          )}
          <div style={{ fontSize: '32px', fontWeight: 700, color: accent }}>
            {currentUpsell.compareAtPrice != null && (
              <span style={{ fontSize: '14px', fontWeight: 400, color: '#8A8A8E' }}>por </span>
            )}
            {formatBRL(currentUpsell.priceInCents)}
          </div>
        </div>

        {/* ONE_CLICK notice */}
        {currentUpsell.chargeType === 'ONE_CLICK' && (
          <div
            style={{
              background: '#141416',
              border: '1px solid #2A2A2E',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#8A8A8E',
            }}
          >
            {kloelT(`Sera cobrado no mesmo cartao utilizado na compra`)}
          </div>
        )}

        {/* Accept button */}
        <button
          type="button"
          onClick={handleAccept}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '18px',
            background: `linear-gradient(135deg, ${accent}, #16a34a)`,
            border: 'none',
            borderRadius: '12px',
            color: '#FFFFFF',
            fontSize: '17px',
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: font,
            marginBottom: '12px',
            opacity: submitting ? 0.7 : 1,
            animation: submitting ? 'none' : 'upsellPulse 2s ease-in-out infinite',
            boxShadow: `0 4px 20px ${accent}44`,
          }}
        >
          {submitting ? 'Processando...' : currentUpsell.acceptBtnText || 'Sim, quero essa oferta!'}
        </button>

        {/* Decline link */}
        <button
          type="button"
          onClick={handleDecline}
          disabled={submitting}
          style={{
            background: 'none',
            border: 'none',
            color: '#8A8A8E',
            fontSize: '13px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: font,
            textDecoration: 'underline',
            padding: '8px',
            opacity: submitting ? 0.5 : 1,
          }}
        >
          {currentUpsell.declineBtnText || 'Nao, obrigado'}
        </button>

        <style>{`
          @keyframes upsellPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02); }
          }
        `}</style>
      </div>
    </div>
  );
}
