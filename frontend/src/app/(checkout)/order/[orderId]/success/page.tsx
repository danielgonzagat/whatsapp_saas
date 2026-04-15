'use client';

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
          stroke="#22c55e"
          strokeWidth="3"
          strokeDasharray="226"
          strokeDashoffset="226"
          style={{ animation: 'successCircle 0.6s ease forwards' }}
        />
        <polyline
          points="26,42 36,52 56,30"
          fill="none"
          stroke="#22c55e"
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
  const { data } = useOrderStatus(orderId, 0); // single fetch, no polling
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const font = "'DM Sans', sans-serif";
  const accent = '#22c55e';
  const orderNumber = data?.orderNumber || '...';

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
        {/* Animated checkmark */}
        <AnimatedCheck />

        {/* Title */}
        <h1 style={{ color: '#E8E6E1', fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>
          Pedido confirmado!
        </h1>
        <p style={{ color: '#8A8A8E', fontSize: '14px', margin: '0 0 28px' }}>
          Obrigado pela sua compra
        </p>

        {/* Order number */}
        <div
          style={{
            background: '#141416',
            border: '1px solid #2A2A2E',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: '#8A8A8E',
              textTransform: 'uppercase',
              marginBottom: '6px',
              fontWeight: 500,
            }}
          >
            Numero do pedido
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: accent, letterSpacing: '1px' }}>
            {orderNumber}
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            background: '#141416',
            border: '1px solid #2A2A2E',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              color: '#8A8A8E',
              marginBottom: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            Resumo
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              color: '#E8E6E1',
              marginBottom: '8px',
            }}
          >
            <span>Status</span>
            <span style={{ color: accent, fontWeight: 600 }}>
              {data?.status === 'PAID'
                ? 'Pago'
                : data?.status === 'PENDING'
                  ? 'Pendente'
                  : data?.status || '...'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              color: '#E8E6E1',
            }}
          >
            <span>Metodo</span>
            <span style={{ color: '#8A8A8E' }}>
              {data?.payment?.status === 'APPROVED' ? 'Aprovado' : data?.payment?.status || '...'}
            </span>
          </div>
        </div>

        {/* Email notice */}
        <div
          style={{
            background: '#0F1F0F',
            border: '1px solid #22c55e33',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '20px',
          }}
        >
          <p style={{ color: '#22c55e', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
            Voce recebera os detalhes por e-mail com informacoes de acompanhamento.
          </p>
        </div>

        {/* Delivery estimate */}
        <div
          style={{
            color: '#8A8A8E',
            fontSize: '12px',
            lineHeight: '1.5',
          }}
        >
          <p style={{ margin: 0 }}>
            Prazo estimado de entrega:{' '}
            <strong style={{ color: '#E8E6E1' }}>5 a 10 dias uteis</strong>
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
