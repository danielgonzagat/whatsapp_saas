'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useOrderStatus } from '../../../hooks/useCheckout';

/** Boleto payment page. */
export default function BoletoPaymentPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const { data, loading } = useOrderStatus(orderId, 5000);

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const barcode = data?.payment?.boletoBarcode;
  const boletoUrl = data?.payment?.boletoUrl;
  const expiresAt = data?.payment?.boletoExpiresAt;

  const handleCopy = useCallback(() => {
    if (!barcode) {
      return;
    }
    navigator.clipboard.writeText(barcode).then(() => {
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    });
  }, [barcode]);

  const font = "'DM Sans', sans-serif";
  const accent = '#D4AF37';

  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

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
      <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>&#128196;</div>
          <h1 style={{ color: '#E8E6E1', fontSize: '22px', fontWeight: 700, margin: '0 0 4px' }}>
            Boleto gerado
          </h1>
          <p style={{ color: '#8A8A8E', fontSize: '14px', margin: 0 }}>
            Copie o codigo de barras ou abra o PDF para pagar
          </p>
        </div>

        {/* Expiration */}
        {formattedExpiry && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#1A1A1E',
              border: '1px solid #2A2A2E',
              borderRadius: '10px',
              padding: '10px 20px',
              marginBottom: '24px',
              color: '#8A8A8E',
              fontSize: '13px',
            }}
          >
            Vencimento: <span style={{ color: accent, fontWeight: 600 }}>{formattedExpiry}</span>
          </div>
        )}

        {/* Barcode display */}
        <div
          style={{
            background: '#141416',
            border: '1px solid #2A2A2E',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
          }}
        >
          {loading || !barcode ? (
            <div style={{ color: '#8A8A8E', fontSize: '14px', padding: '20px 0' }}>
              Carregando boleto...
            </div>
          ) : (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#E8E6E1',
                wordBreak: 'break-all',
                lineHeight: '1.6',
                letterSpacing: '1px',
              }}
            >
              {barcode}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!barcode}
            style={{
              width: '100%',
              padding: '14px',
              background: copied ? '#1A2E1A' : `${accent}18`,
              border: `1px solid ${copied ? '#22c55e' : accent}44`,
              borderRadius: '10px',
              color: copied ? '#22c55e' : accent,
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: font,
              transition: 'all 0.2s',
            }}
          >
            {copied ? 'Copiado!' : 'Copiar codigo de barras'}
          </button>

          {boletoUrl && (
            <a
              href={boletoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: '100%',
                padding: '14px',
                background: '#141416',
                border: '1px solid #2A2A2E',
                borderRadius: '10px',
                color: '#E8E6E1',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: font,
                textDecoration: 'none',
                display: 'block',
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            >
              Abrir PDF do boleto
            </a>
          )}
        </div>

        {/* Info */}
        <p style={{ color: '#8A8A8E', fontSize: '12px', marginTop: '20px', lineHeight: '1.5' }}>
          O pagamento pode levar ate 3 dias uteis para ser compensado. Voce recebera uma confirmacao
          por e-mail.
        </p>
      </div>
    </div>
  );
}
