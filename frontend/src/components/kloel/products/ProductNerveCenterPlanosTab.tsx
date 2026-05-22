'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import type React from 'react';
import {
  Bt,
  PanelLoadingState,
  V,
  cs,
} from './product-nerve-center.shared';
import type { ProductEditorPlanView } from './product-nerve-center.view-models';
import {
  PlanoCardMobile,
  PlanoRowDesktop,
} from './ProductNerveCenterPlanosTab.components';

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

/** Product nerve center planos tab. */
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
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>
          {kloelT(`Planos cadastrados`)}
        </h2>
        <Bt primary onClick={() => setModal('newPlan')}>
          {kloelT(`+ Novo plano`)}
        </Bt>
      </div>
      {plansLoading ? (
        <PanelLoadingState
          label={kloelT(`Sincronizando planos`)}
          description={kloelT(
            `Mantendo o shell do produto ativo enquanto os dados comerciais chegam.`,
          )}
        />
      ) : plans.length === 0 ? (
        <div style={{ ...cs, padding: 40, textAlign: 'center' }}>
          <span style={{ color: V.t3, fontSize: 13 }}>{kloelT(`Nenhum plano cadastrado`)}</span>
        </div>
      ) : isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {plans.map((plan) => (
            <PlanoCardMobile
              key={plan.id}
              plan={plan}
              selPlan={selPlan}
              setSelPlan={setSelPlan}
              setModal={setModal}
              copied={copied}
              onDuplicatePlan={onDuplicatePlan}
            />
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
                borderBottom: index < plans.length - 1 ? `1px solid ${V.b}` : 'none',
              }}
            >
              <PlanoRowDesktop
                plan={plan}
                selPlan={selPlan}
                setSelPlan={setSelPlan}
                setModal={setModal}
                copied={copied}
                onDuplicatePlan={onDuplicatePlan}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
