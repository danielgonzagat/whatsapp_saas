'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
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
  const hasBoletoData = Boolean(barcode || boletoUrl);

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
  const accent = colors.checkout.accent;

  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;
  const title = loading
    ? kloelT(`Carregando boleto`)
    : hasBoletoData
      ? kloelT(`Boleto gerado`)
      : kloelT(`Boleto indisponivel`);
  const subtitle = loading
    ? kloelT(`Buscando os dados do pedido`)
    : hasBoletoData
      ? kloelT(`Copie o codigo de barras ou abra o PDF para pagar`)
      : kloelT(`Este pedido nao possui boleto gerado. Use Pix ou cartao no checkout.`);

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
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>{kloelT(`&rgb(18, 129, 150);`)}</div>
          <h1
            style={{
              color: colors.checkout.textPrimary,
              fontSize: '22px',
              fontWeight: 700,
              margin: '0 0 4px',
            }}
          >
            {title}
          </h1>
          <p style={{ color: colors.text.muted, fontSize: '14px', margin: 0 }}>{subtitle}</p>
        </div>

        {/* Expiration */}
        {formattedExpiry && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: colors.checkout.surface,
              border: `1px solid ${colors.checkout.border}`,
              borderRadius: '8px',
              padding: '10px 20px',
              marginBottom: '24px',
              color: colors.text.muted,
              fontSize: '13px',
            }}
          >
            {kloelT(`Vencimento:`)}{' '}
            <span style={{ color: accent, fontWeight: 600 }}>{formattedExpiry}</span>
          </div>
        )}

        {/* Barcode display */}
        <div
          style={{
            background: colors.checkout.bg,
            border: `1px solid ${colors.checkout.border}`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
          }}
        >
          {loading ? (
            <div style={{ color: colors.text.muted, fontSize: '14px', padding: '20px 0' }}>
              {kloelT(`Carregando boleto...`)}
            </div>
          ) : !hasBoletoData ? (
            <div
              style={{
                color: colors.text.muted,
                fontSize: '14px',
                padding: '20px 0',
                lineHeight: 1.6,
              }}
            >
              {kloelT(`Nenhum boleto foi encontrado para este pedido.`)}
            </div>
          ) : !barcode ? (
            <div
              style={{
                color: colors.text.muted,
                fontSize: '14px',
                padding: '20px 0',
                lineHeight: 1.6,
              }}
            >
              {kloelT(`Boleto disponivel apenas em PDF.`)}
            </div>
          ) : (
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                color: colors.checkout.textPrimary,
                wordBreak: 'break-all',
                lineHeight: '1.6',
                letterSpacing: '1px',
              }}
            >
              {barcode}
            </div>
          )}
        </div>

        {hasBoletoData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!barcode}
              style={{
                width: '100%',
                padding: '14px',
                background: copied ? colors.checkout.successBg : `${accent}18`,
                border: `1px solid ${copied ? colors.checkout.success : accent}44`,
                borderRadius: '8px',
                color: copied ? colors.checkout.success : accent,
                fontSize: '14px',
                fontWeight: 600,
                cursor: barcode ? 'pointer' : 'not-allowed',
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
                  background: colors.checkout.bg,
                  border: `1px solid ${colors.checkout.border}`,
                  borderRadius: '8px',
                  color: colors.checkout.textPrimary,
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
                {kloelT(`Abrir PDF do boleto`)}
              </a>
            )}
          </div>
        )}

        {/* Info */}
        <p
          style={{
            color: colors.text.muted,
            fontSize: '12px',
            marginTop: '20px',
            lineHeight: '1.5',
          }}
        >
          {hasBoletoData
            ? kloelT(`O pagamento pode levar ate 3 dias uteis para ser compensado. Voce recebera uma confirmacao
          por e-mail.`)
            : kloelT(
                `Se voce acabou de tentar pagar por boleto, volte ao checkout e escolha Pix ou cartao.`,
              )}
        </p>
      </div>
    </div>
  );
}
