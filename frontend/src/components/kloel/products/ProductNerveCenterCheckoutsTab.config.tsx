'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { useCheckoutConfig } from '@/hooks/useCheckoutPlans';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useNerveCenterContext } from './product-nerve-center.context';
import {
  Bt,
  Dv,
  Fd,
  Tg,
  V,
  cs,
  is,
  type JsonRecord,
} from './product-nerve-center.shared';
import { useCheckoutConfigForm } from './ProductNerveCenterCheckoutsTab.hooks';
import {
  CheckoutConfigLoading,
  CheckoutConfigInfo,
  PaymentCheckboxes,
  CouponSelector,
  TimerConfig,
  ColorPickerField,
  SocialProofSection,
  ExitConfirmModal,
} from './ProductNerveCenterCheckoutsTab.sections';
import { PlanLinkingSection } from './ProductNerveCenterCheckoutsTab.plan-linking';

interface CheckoutConfigPanelProps {
  ckEdit: string;
  rawCheckouts: JsonRecord[];
  rawPlans: JsonRecord[];
  setCkEdit: (value: string | null) => void;
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>;
  updatePlan: (planId: string, payload: JsonRecord) => Promise<unknown>;
}

export function CheckoutConfigPanel({
  ckEdit,
  rawCheckouts,
  rawPlans,
  setCkEdit,
  syncCheckoutLinks,
  updatePlan,
}: CheckoutConfigPanelProps) {
  const { isMobile } = useResponsiveViewport();
  const { COUPONS } = useNerveCenterContext();
  const { showToast } = useToast();
  const {
    config: ckCfg,
    updateConfig: saveCkCfg,
    isLoading: ckLoading,
  } = useCheckoutConfig(ckEdit);
  const {
    ckLocal,
    ckSaving,
    ckSaved,
    setLinkedPlanIds,
    showExitConfirm,
    setShowExitConfirm,
    checkoutForCk,
    selectedPlans,
    availablePlans,
    hasUnsavedChanges,
    patch,
    handleSave,
    handleBack,
  } = useCheckoutConfigForm(
    ckEdit,
    ckCfg as JsonRecord | null,
    rawCheckouts,
    rawPlans,
    saveCkCfg as (payload: JsonRecord) => Promise<unknown>,
    syncCheckoutLinks,
    updatePlan,
    showToast,
    setCkEdit,
  );

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Bt onClick={() => (hasUnsavedChanges ? setShowExitConfirm(true) : setCkEdit(null))}>
          {kloelT(`← Checkouts`)}
        </Bt>
        <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>
          {kloelT(`Configurações —`)} {String(checkoutForCk?.name || 'Checkout')}
        </span>
      </div>
      {ckLoading ? (
        <CheckoutConfigLoading />
      ) : (
        <div style={{ ...cs, padding: isMobile ? 16 : 24 }}>
          <CheckoutConfigInfo />
          <Fd
            label={kloelT(`Nome / Descrição *`)}
            value={String(ckLocal.brandName ?? '')}
            onChange={(value) => patch('brandName', value)}
            full
          />
          <Dv />
          <PaymentCheckboxes ckLocal={ckLocal} patch={patch} />
          <Dv />
          <CouponSelector ckLocal={ckLocal} patch={patch} coupons={COUPONS} />
          <Dv />
          <TimerConfig ckLocal={ckLocal} patch={patch} isMobile={isMobile} />
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            {kloelT(`Personalizar`)}
          </h4>
          <ColorPickerField
            label={kloelT(`Cor principal`)}
            value={String(ckLocal.accentColor ?? 'colors.ember.primary')}
            placeholder={kloelT(`colors.ember.primary`)}
            onChange={(value) => patch('accentColor', value)}
          />
          <ColorPickerField
            label={kloelT(`Cor fundo`)}
            value={String(
              ckLocal.backgroundColor ||
                (ckLocal.theme === 'NOIR' ? 'colors.background.void' : colors.text.silver),
            )}
            placeholder={
              ckLocal.theme === 'NOIR' ? 'colors.background.void' : colors.text.silver
            }
            onChange={(value) => patch('backgroundColor', value)}
          />
          <Fd
            label={kloelT(`Texto do botão`)}
            value={String(ckLocal.btnFinalizeText ?? 'Finalizar compra')}
            onChange={(value) => patch('btnFinalizeText', value)}
            full
          />
          <Fd label={kloelT(`Layout`)}>
            <select
              style={is}
              value={String(ckLocal.theme ?? 'BLANC')}
              onChange={(event) => patch('theme', event.target.value)}
            >
              <option value="NOIR">{kloelT(`Noir (Escuro)`)}</option>
              <option value="BLANC">{kloelT(`Blanc (Claro)`)}</option>
            </select>
          </Fd>
          <Dv />
          <PlanLinkingSection
            selectedPlans={selectedPlans}
            availablePlans={availablePlans}
            rawPlans={rawPlans}
            setLinkedPlanIds={setLinkedPlanIds}
          />
          <Dv />
          <SocialProofSection ckLocal={ckLocal} patch={patch} />
          <Dv />
          <Tg
            label={kloelT(`Popup Exit Intent?`)}
            checked={Boolean(ckLocal.showCouponPopup)}
            onChange={(value) => patch('showCouponPopup', value)}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column-reverse' : 'row',
              gap: 12,
              marginTop: 20,
            }}
          >
            <Bt onClick={() => (hasUnsavedChanges ? setShowExitConfirm(true) : setCkEdit(null))}>
              {kloelT(`← Voltar`)}
            </Bt>
            <Bt
              primary
              onClick={() => void handleSave()}
              style={{ marginLeft: isMobile ? 0 : 'auto', justifyContent: 'center' }}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {ckSaved ? 'Salvo!' : ckSaving ? 'Salvando...' : 'Salvar'}
            </Bt>
          </div>
        </div>
      )}
      {showExitConfirm ? (
        <ExitConfirmModal
          isMobile={isMobile}
          onClose={() => setShowExitConfirm(false)}
          onStay={() => void handleBack(false)}
          onDiscard={() => void handleBack(true)}
        />
      ) : null}
    </>
  );
}
