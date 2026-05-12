'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOrderStatus } from '../../../hooks/useCheckout';

/* ─── Checkmark icon ───────────────────────────────────────────────────────── */

function AnimatedCheck() {
  return (
    <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 20px' }}>
      <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke={colors.checkout.success}
          strokeWidth="3"
          strokeDasharray="226"
          strokeDashoffset="226"
          style={{ animation: 'successCircle 0.6s ease forwards' }}
        />
        <polyline
          points="26,42 36,52 56,30"
          fill="none"
          stroke={colors.checkout.success}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="40"
          strokeDashoffset="40"
          style={{ animation: 'successCheck 0.4s ease 0.5s forwards' }}
        />
      </svg>
    </div>
  );
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function SuccessPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const { data, error, loading } = useOrderStatus(orderId, 3000);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const font = "'DM Sans', sans-serif";
  const isPaid = data?.status === 'PAID';
  const isTerminalFailure =
    data?.status === 'CANCELED' || data?.status === 'REFUNDED' || Boolean(error);
  const accent = isPaid
    ? colors.checkout.success
    : isTerminalFailure
      ? colors.checkout.danger
      : colors.semantic.warning;
  const orderNumber = data?.orderNumber || '...';
  const title = isPaid
    ? 'Pedido confirmado!'
    : isTerminalFailure
      ? 'Pedido nao confirmado'
      : 'Confirmando pedido...';
  const subtitle = isPaid
    ? 'Obrigado pela sua compra'
    : isTerminalFailure
      ? 'Nao encontramos uma confirmacao de pagamento para este pedido.'
      : 'Estamos aguardando a confirmacao do pagamento.';

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
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          textAlign: 'center',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 0.5s ease',
        }}
      >
        {isPaid ? (
          <AnimatedCheck />
        ) : (
          <div
            style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              border: `3px solid ${accent}`,
              color: accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              fontWeight: 700,
            }}
            aria-hidden="true"
          >
            {loading ? '...' : '!'}
          </div>
        )}

        {/* Title */}
        <h1
          style={{
            color: colors.checkout.textPrimary,
            fontSize: '24px',
            fontWeight: 700,
            margin: '0 0 8px',
          }}
        >
          {kloelT(title)}
        </h1>
        <p style={{ color: colors.text.muted, fontSize: '14px', margin: '0 0 28px' }}>
          {kloelT(subtitle)}
        </p>

        {/* Order number */}
        <div
          style={{
            background: colors.checkout.bg,
            border: `1px solid ${colors.checkout.border}`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: colors.text.muted,
              textTransform: 'uppercase',
              marginBottom: '6px',
              fontWeight: 500,
            }}
          >
            {kloelT(`Numero do pedido`)}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: accent, letterSpacing: '1px' }}>
            {orderNumber}
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            background: colors.checkout.bg,
            border: `1px solid ${colors.checkout.border}`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              color: colors.text.muted,
              marginBottom: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Resumo`)}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              color: colors.checkout.textPrimary,
              marginBottom: '8px',
            }}
          >
            <span>{kloelT(`Status`)}</span>
            <span style={{ color: accent, fontWeight: 600 }}>
              {loading
                ? 'Consultando...'
                : data?.status === 'PAID'
                  ? 'Pago'
                  : data?.status === 'PENDING'
                    ? 'Pendente'
                    : data?.status || error || '...'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              color: colors.checkout.textPrimary,
            }}
          >
            <span>{kloelT(`Metodo`)}</span>
            <span style={{ color: colors.text.muted }}>
              {data?.payment?.status === 'APPROVED' ? 'Aprovado' : data?.payment?.status || '...'}
            </span>
          </div>
        </div>

        {/* Email notice */}
        <div
          style={{
            background: isPaid ? colors.checkout.successBg : colors.checkout.bg,
            border: `1px solid ${accent}33`,
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '20px',
          }}
        >
          <p style={{ color: accent, fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
            {isPaid
              ? kloelT(`Voce recebera os detalhes por e-mail com informacoes de acompanhamento.`)
              : kloelT(
                  `Esta pagina sera atualizada automaticamente quando o pagamento for confirmado.`,
                )}
          </p>
        </div>

        {/* Delivery estimate */}
        <div
          style={{
            color: colors.text.muted,
            fontSize: '12px',
            lineHeight: '1.5',
          }}
        >
          <p style={{ margin: 0 }}>
            {kloelT(`Prazo estimado de entrega:`)}{' '}
            <strong style={{ color: colors.checkout.textPrimary }}>
              {kloelT(`5 a 10 dias uteis`)}
            </strong>
          </p>
        </div>

        <style>{`
          @keyframes successCircle {
            to { stroke-dashoffset: 0; }
          }
          @keyframes successCheck {
            to { stroke-dashoffset: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
