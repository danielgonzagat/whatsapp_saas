'use client';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { useCheckoutConfig } from '@/hooks/useCheckoutPlans';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useEffect, useId, useState } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import {
  Bg,
  Bt,
  Dv,
  Fd,
  IconActionButton,
  M,
  Modal,
  PanelLoadingState,
  Tg,
  V,
  cs,
  formatBrlCents,
  is,
  type JsonRecord,
  type JsonValue,
} from './product-nerve-center.shared';
import type { ProductEditorCheckoutView } from './product-nerve-center.view-models';
import { colors } from '@/lib/design-tokens';

interface ProductNerveCenterCheckoutsTabProps {
  ckEdit: string | null;
  setCkEdit: (value: string | null) => void;
  checkouts: ProductEditorCheckoutView[];
  rawCheckouts: JsonRecord[];
  rawPlans: JsonRecord[];
  copied: string | null;
  onDuplicateCheckout: (checkoutId: string) => void | Promise<void>;
  onDeleteCheckout: (checkoutId: string) => void | Promise<void>;
  onCreateCheckout: () => void | Promise<void>;
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>;
  updatePlan: (planId: string, payload: JsonRecord) => Promise<unknown>;
}

/** Product nerve center checkouts tab. */
export function ProductNerveCenterCheckoutsTab({
  ckEdit,
  setCkEdit,
  checkouts,
  rawCheckouts,
  rawPlans,
  copied,
  onDuplicateCheckout,
  onDeleteCheckout,
  onCreateCheckout,
  syncCheckoutLinks,
  updatePlan,
}: ProductNerveCenterCheckoutsTabProps) {
  const { isMobile } = useResponsiveViewport();

  if (ckEdit) {
    return (
      <CheckoutConfigPanel
        ckEdit={ckEdit}
        rawCheckouts={rawCheckouts}
        rawPlans={rawPlans}
        setCkEdit={setCkEdit}
        syncCheckoutLinks={syncCheckoutLinks}
        updatePlan={updatePlan}
      />
    );
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>
          {kloelT(`Checkouts disponíveis`)}
        </h2>
        <Bt primary onClick={() => void onCreateCheckout()}>
          {kloelT(`+ Novo checkout`)}
        </Bt>
      </div>
      {isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {checkouts.length === 0 ? (
            <div style={{ ...cs, padding: '24px 16px', textAlign: 'center' }}>
              <span style={{ color: V.t3, fontSize: 12 }}>{kloelT(`Nenhum checkout criado`)}</span>
            </div>
          ) : (
            checkouts.map((checkout) => (
              <div key={checkout.id} style={{ ...cs, padding: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: M, fontSize: 10, color: V.t3, marginBottom: 4 }}>
                      {checkout.code}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: V.t,
                        lineHeight: 1.35,
                      }}
                    >
                      {checkout.desc}
                    </div>
                  </div>
                  <Bg color={checkout.active ? V.g : V.r}>{checkout.active ? 'ATIVO' : 'OFF'}</Bg>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {checkout.mt.map((method) => (
                    <Bg
                      key={method}
                      color={method === 'BOLETO' ? V.pk : method === 'PIX' ? V.g2 : V.bl}
                    >
                      {method}
                    </Bg>
                  ))}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        color: V.t3,
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {kloelT(`Vendas`)}
                    </div>
                    <div
                      style={{
                        fontFamily: M,
                        fontSize: 12,
                        fontWeight: 700,
                        color: checkout.sales > 0 ? V.em : V.t2,
                        marginTop: 4,
                      }}
                    >
                      {checkout.sales}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        color: V.t3,
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {kloelT(`Parcelas`)}
                    </div>
                    <div style={{ fontFamily: M, fontSize: 12, color: V.t, marginTop: 4 }}>
                      {kloelT(`Até`)} {checkout.installments}x
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        color: V.t3,
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {kloelT(`Itens`)}
                    </div>
                    <div style={{ fontSize: 12, color: V.t2, marginTop: 4 }}>
                      {checkout.quantity} item{checkout.quantity === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <IconActionButton
                    label={kloelT(`Editar`)}
                    color={V.bl}
                    onClick={() => setCkEdit(checkout.id)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path d={kloelT(`M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7`)} />
                      <path d={kloelT(`M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z`)} />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label={kloelT(`Duplicar`)}
                    color={V.p}
                    active={copied === `duplicate-${checkout.id}`}
                    onClick={() => onDuplicateCheckout(checkout.id)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d={kloelT(`M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1`)} />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label={kloelT(`Excluir`)}
                    color={V.r}
                    onClick={() => onDeleteCheckout(checkout.id)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path d={kloelT(`M3 6h18`)} />
                      <path d={kloelT(`M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2`)} />
                      <path d={kloelT(`M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6`)} />
                      <path d={kloelT(`M10 11v6`)} />
                      <path d={kloelT(`M14 11v6`)} />
                    </svg>
                  </IconActionButton>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '.9fr 1.8fr 1fr .7fr 1fr .8fr 1.2fr',
              padding: '10px 14px',
              borderBottom: `1px solid ${V.b}`,
              background: V.e,
            }}
          >
            {['Código', 'Descrição', 'Pagamento', 'Vendas', 'Oferta', 'Status', 'Ações'].map(
              (heading) => (
                <span
                  key={heading}
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: V.t3,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {heading}
                </span>
              ),
            )}
          </div>
          {checkouts.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <span style={{ color: V.t3, fontSize: 12 }}>{kloelT(`Nenhum checkout criado`)}</span>
            </div>
          ) : (
            checkouts.map((checkout, index) => (
              <div
                key={checkout.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '.9fr 1.8fr 1fr .7fr 1fr .8fr 1.2fr',
                  padding: '10px 14px',
                  borderBottom: index < checkouts.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontFamily: M, fontSize: 10, color: V.t3 }}>{checkout.code}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: V.t,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {checkout.desc}
                </span>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {checkout.mt.map((method) => (
                    <Bg
                      key={method}
                      color={method === 'BOLETO' ? V.pk : method === 'PIX' ? V.g2 : V.bl}
                    >
                      {method}
                    </Bg>
                  ))}
                </div>
                <span
                  style={{
                    fontFamily: M,
                    fontSize: 11,
                    fontWeight: 600,
                    color: checkout.sales > 0 ? V.em : V.t2,
                    textAlign: 'center',
                  }}
                >
                  {checkout.sales}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontFamily: M, fontSize: 11, color: V.t }}>
                    {kloelT(`Até`)} {checkout.installments}x
                  </span>
                  <span style={{ fontSize: 10, color: V.t3 }}>
                    {checkout.quantity} item{checkout.quantity === 1 ? '' : 's'}
                  </span>
                </div>
                <Bg color={checkout.active ? V.g : V.r}>{checkout.active ? 'ATIVO' : 'OFF'}</Bg>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <IconActionButton
                    label={kloelT(`Editar`)}
                    color={V.bl}
                    onClick={() => setCkEdit(checkout.id)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path d={kloelT(`M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7`)} />
                      <path d={kloelT(`M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z`)} />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label={kloelT(`Duplicar`)}
                    color={V.p}
                    active={copied === `duplicate-${checkout.id}`}
                    onClick={() => onDuplicateCheckout(checkout.id)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d={kloelT(`M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1`)} />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label={kloelT(`Excluir`)}
                    color={V.r}
                    onClick={() => onDeleteCheckout(checkout.id)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path d={kloelT(`M3 6h18`)} />
                      <path d={kloelT(`M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2`)} />
                      <path d={kloelT(`M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6`)} />
                      <path d={kloelT(`M10 11v6`)} />
                      <path d={kloelT(`M14 11v6`)} />
                    </svg>
                  </IconActionButton>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
import "../../../__companions__/ProductNerveCenterCheckoutsTab.companion";
