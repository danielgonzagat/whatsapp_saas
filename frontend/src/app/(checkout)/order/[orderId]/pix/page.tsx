'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useOrderStatus } from '../../../hooks/useCheckout';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function PixPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;
  const { data, loading } = useOrderStatus(orderId, 3000);

  const [countdown, setCountdown] = useState(30 * 60); // 30 min
  const [copied, setCopied] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const t = setInterval(() => setCountdown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Redirect when paid
  useEffect(() => {
    if (!data) {
      return;
    }
    if (data.status === 'PAID') {
      router.push(`/order/${orderId}/success`);
    }
  }, [data, orderId, router]);

  // Sync countdown with server expiry
  useEffect(() => {
    if (data?.payment?.pixExpiresAt) {
      const remaining = Math.max(
        0,
        Math.floor((new Date(data.payment.pixExpiresAt).getTime() - Date.now()) / 1000),
      );
      setCountdown(remaining);
    }
  }, [data?.payment?.pixExpiresAt]);

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const handleCopy = useCallback(() => {
    const code = data?.payment?.pixCopyPaste;
    if (!code) {
      return;
    }
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    });
  }, [data?.payment?.pixCopyPaste]);

  const expired = countdown <= 0;

  /* ─── Styles ──────────────────────────────────────────────────────────── */

  const font = "'DM Sans', sans-serif";
  const accent = colors.checkout.accent;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font,
        padding: '24px 16px',
      }}
    >
      <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>{kloelT(`&#9889;`)}</div>
          <h1 style={{ color: colors.checkout.textPrimary, fontSize: '22px', fontWeight: 700, margin: '0 0 4px' }}>
            {kloelT(`Pagamento via Pix`)}
          </h1>
          <p style={{ color: colors.text.muted, fontSize: '14px', margin: 0 }}>
            {kloelT(`Escaneie o QR Code ou copie o codigo abaixo`)}
          </p>
        </div>

        {/* Countdown */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: expired ? colors.checkout.dangerBg : colors.checkout.surface,
            border: `1px solid ${expired ? 'var(--app-error)' : colors.canvas.hover}`,
            borderRadius: '10px',
            padding: '10px 20px',
            marginBottom: '24px',
            color: expired ? 'var(--app-error)' : accent,
            fontSize: '16px',
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          {expired ? 'Expirado' : formatTime(countdown)}
        </div>

        {/* QR Code */}
        <div
          style={{
            background: colors.text.silver,
            borderRadius: '16px',
            padding: '20px',
            display: 'inline-block',
            marginBottom: '20px',
          }}
        >
          {loading || !data?.payment?.pixQrCode ? (
            <div
              style={{
                width: '220px',
                height: '220px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.text.muted,
              }}
            >
              {kloelT(`Carregando QR Code...`)}
            </div>
          ) : (
            <Image
              src={data.payment.pixQrCode}
              alt="Pix QR Code"
              width={220}
              height={220}
              unoptimized
              style={{ width: '220px', height: '220px', imageRendering: 'pixelated' }}
            />
          )}
        </div>

        {/* Copy code */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              background: colors.checkout.bg,
              border: `1px solid ${colors.checkout.border}`,
              borderRadius: '10px',
              padding: '14px 16px',
              color: colors.text.muted,
              fontSize: '12px',
              wordBreak: 'break-all',
              marginBottom: '12px',
              lineHeight: '1.5',
              maxHeight: '80px',
              overflow: 'hidden',
            }}
          >
            {data?.payment?.pixCopyPaste || 'Carregando...'}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!data?.payment?.pixCopyPaste}
            style={{
              width: '100%',
              padding: '14px',
              background: copied ? colors.checkout.successBg : `${accent}18`,
              border: `1px solid ${copied ? colors.checkout.success : accent}44`,
              borderRadius: '10px',
              color: copied ? colors.checkout.success : accent,
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: font,
              transition: 'all 0.2s',
            }}
          >
            {copied ? 'Copiado!' : 'Copiar codigo Pix'}
          </button>
        </div>

        {/* Status */}
        <div
          style={{
            color: colors.text.muted,
            fontSize: '13px',
            lineHeight: '1.5',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: colors.checkout.bg,
              borderRadius: '8px',
              padding: '10px 16px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: colors.checkout.success,
                animation: 'pixPulse 1.5s ease-in-out infinite',
              }}
            />

            {kloelT(`Aguardando pagamento...`)}
          </div>
        </div>

        <style>{`
          @keyframes pixPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    </div>
  );
}
