'use client';

import React from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import { Bg, Bt, cs, M, PanelLoadingState, V } from './product-nerve-center.shared';

export function ProductNerveCenterCuponsTab({
  primaryPlanId,
  primaryCheckoutConfig,
  onDeleteCoupon,
}: {
  primaryPlanId: string | null;
  primaryCheckoutConfig: any;
  onDeleteCoupon: (id: string) => Promise<void>;
}) {
  const { setModal, openCheckoutEditor, COUPONS, couponsLoading, initialFocus } =
    useNerveCenterContext();

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>Cupons</h2>
        <Bt primary onClick={() => setModal('newCoupon')}>
          + Criar cupom
        </Bt>
      </div>
      <div
        style={{
          ...cs,
          padding: 16,
          marginBottom: 16,
          background: initialFocus === 'coupon' ? `${V.em}08` : V.s,
          border: initialFocus === 'coupon' ? `1px solid ${V.em}25` : `1px solid ${V.b}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: V.t }}>Cupom de recuperação</div>
            <div style={{ fontSize: 11, color: V.t3, marginTop: 4, lineHeight: 1.6 }}>
              {primaryPlanId
                ? `Checkout principal ${primaryCheckoutConfig.enableCoupon !== false ? 'já aceita' : 'ainda não aceita'} cupom. ${primaryCheckoutConfig.autoCouponCode ? `Cupom automático atual: ${primaryCheckoutConfig.autoCouponCode}.` : 'Você pode aplicar um cupom automático no popup e no exit intent.'}`
                : 'Crie um checkout para aplicar cupons automáticos e popup de recuperação.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {primaryPlanId && (
              <Bt primary onClick={() => openCheckoutEditor('coupon', primaryPlanId)}>
                Abrir no checkout
              </Bt>
            )}
            {primaryPlanId && (
              <Bt onClick={() => openCheckoutEditor('order-bump', primaryPlanId)}>
                Ver bump junto
              </Bt>
            )}
          </div>
        </div>
      </div>
      {couponsLoading ? (
        <PanelLoadingState
          label="Sincronizando cupons"
          description="Os descontos do produto estão sendo carregados em segundo plano."
        />
      ) : COUPONS.length === 0 ? (
        <div style={{ ...cs, padding: 40, textAlign: 'center' }}>
          <span style={{ color: V.t3, fontSize: 13 }}>Nenhum cupom cadastrado</span>
        </div>
      ) : (
        COUPONS.map((c: any) => (
          <div
            key={c.id}
            style={{
              ...cs,
              padding: 16,
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: c.on ? V.em : V.t3,
              }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', color: V.t2 }}>
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontFamily: M,
                  fontSize: 15,
                  fontWeight: 700,
                  color: V.t,
                  letterSpacing: '.06em',
                }}
              >
                {c.code}
              </span>
              <br />
              <span style={{ fontSize: 11, color: V.t2 }}>
                {c.type === '%'
                  ? `${c.val}% de desconto`
                  : `R$ ${Number(c.val || 0).toFixed(2)} de desconto`}
              </span>
              {c.expiresAt && (
                <span style={{ display: 'block', fontSize: 10, color: V.t3, marginTop: 4 }}>
                  Expira em {new Date(c.expiresAt).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: M, fontSize: 14, fontWeight: 600, color: V.t }}>
                {c.used}
              </span>
              <br />
              <span style={{ fontSize: 9, color: V.t3 }}>usos{c.max ? ` / ${c.max}` : ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bg color={c.on ? V.g : V.t3}>{c.on ? 'ATIVO' : 'OFF'}</Bg>
              <Bt onClick={() => onDeleteCoupon(c.id)} style={{ padding: '4px 8px', color: V.r }}>
                Excluir
              </Bt>
            </div>
          </div>
        ))
      )}
    </>
  );
}
