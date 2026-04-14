'use client';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import type React from 'react';
import {
  Bg,
  Bt,
  IconActionButton,
  M,
  PanelLoadingState,
  V,
  cs,
  formatBrlCents,
} from './product-nerve-center.shared';
import type { ProductEditorPlanView } from './product-nerve-center.view-models';

interface ProductNerveCenterPlanosTabProps {
  plansLoading: boolean;
  plans: ProductEditorPlanView[];
  selPlan: string | null;
  setSelPlan: (planId: string | null) => void;
  setModal: (value: string | null) => void;
  copied: string | null;
  onDuplicatePlan: (planId: string) => void | Promise<void>;
  renderPlanDetail: (plan: ProductEditorPlanView) => React.ReactNode;
}

export function ProductNerveCenterPlanosTab({
  plansLoading,
  plans,
  selPlan,
  setSelPlan,
  setModal,
  copied,
  onDuplicatePlan,
  renderPlanDetail,
}: ProductNerveCenterPlanosTabProps) {
  const { isMobile } = useResponsiveViewport();

  if (selPlan) {
    const selectedPlan = plans.find((plan) => plan.id === selPlan);
    if (selectedPlan) {
      return <>{renderPlanDetail(selectedPlan)}</>;
    }
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
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>Planos cadastrados</h2>
        <Bt primary onClick={() => setModal('newPlan')}>
          + Novo plano
        </Bt>
      </div>
      {plansLoading ? (
        <PanelLoadingState
          label="Sincronizando planos"
          description="Mantendo o shell do produto ativo enquanto os dados comerciais chegam."
        />
      ) : plans.length === 0 ? (
        <div style={{ ...cs, padding: 40, textAlign: 'center' }}>
          <span style={{ color: V.t3, fontSize: 13 }}>Nenhum plano cadastrado</span>
        </div>
      ) : isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {plans.map((plan) => (
            <div key={plan.id} style={{ ...cs, padding: 16 }}>
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
                    {plan.ref}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: V.t,
                      lineHeight: 1.35,
                    }}
                  >
                    {plan.name}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <IconActionButton label="Editar" color={V.bl} onClick={() => setSelPlan(plan.id)}>
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label="Duplicar"
                    color={V.p}
                    active={copied === `duplicate-${plan.id}`}
                    onClick={() => onDuplicatePlan(plan.id)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label="Ver links"
                    color={V.em}
                    onClick={() => setModal(`links-${plan.id}`)}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                  </IconActionButton>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <Bg color={plan.vis ? V.g : V.t3}>{plan.vis ? 'VISÍVEL' : 'OCULTO'}</Bg>
                <Bg color={plan.active ? V.g : V.r}>{plan.active ? 'ATIVO' : 'OFF'}</Bg>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
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
                    Itens
                  </div>
                  <div style={{ fontFamily: M, fontSize: 12, color: V.t2, marginTop: 4 }}>
                    {plan.qty}
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
                    Valor
                  </div>
                  <div
                    style={{
                      fontFamily: M,
                      fontSize: 12,
                      fontWeight: 700,
                      color: V.em,
                      marginTop: 4,
                    }}
                  >
                    {formatBrlCents(plan.price)}
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
                    Vendas
                  </div>
                  <div
                    style={{
                      fontFamily: M,
                      fontSize: 12,
                      fontWeight: 700,
                      color: plan.sales > 0 ? V.em : V.t3,
                      marginTop: 4,
                    }}
                  >
                    {plan.sales}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr .6fr .8fr .7fr .7fr .7fr 1.2fr',
              padding: '10px 16px',
              borderBottom: `1px solid ${V.b}`,
              background: V.e,
            }}
          >
            {['Código', 'Nome', 'Itens', 'Valor', 'Afiliados', 'Status', 'Vendas', 'Ações'].map(
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
          {plans.map((plan, index) => (
            <div
              key={plan.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 2fr .6fr .8fr .7fr .7fr .7fr 1.2fr',
                padding: '12px 16px',
                borderBottom: index < plans.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: M, fontSize: 11, color: V.t2 }}>{plan.ref}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: V.t,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {plan.name}
              </span>
              <span style={{ fontFamily: M, fontSize: 12, color: V.t2, textAlign: 'center' }}>
                {plan.qty}
              </span>
              <span style={{ fontFamily: M, fontSize: 12, fontWeight: 600, color: V.em }}>
                {formatBrlCents(plan.price)}
              </span>
              <Bg color={plan.vis ? V.g : V.t3}>{plan.vis ? 'VISÍVEL' : 'OCULTO'}</Bg>
              <Bg color={plan.active ? V.g : V.r}>{plan.active ? 'ATIVO' : 'OFF'}</Bg>
              <span
                style={{
                  fontFamily: M,
                  fontSize: 12,
                  fontWeight: 700,
                  color: plan.sales > 0 ? V.em : V.t3,
                  textAlign: 'center',
                }}
              >
                {plan.sales}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <IconActionButton label="Editar" color={V.bl} onClick={() => setSelPlan(plan.id)}>
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </IconActionButton>
                <IconActionButton
                  label="Duplicar"
                  color={V.p}
                  active={copied === `duplicate-${plan.id}`}
                  onClick={() => onDuplicatePlan(plan.id)}
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                </IconActionButton>
                <IconActionButton
                  label="Ver links"
                  color={V.em}
                  onClick={() => setModal(`links-${plan.id}`)}
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                </IconActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
