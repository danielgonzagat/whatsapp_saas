'use client';

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
          Checkouts disponíveis
        </h2>
        <Bt primary onClick={() => void onCreateCheckout()}>
          + Novo checkout
        </Bt>
      </div>
      {isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {checkouts.length === 0 ? (
            <div style={{ ...cs, padding: '24px 16px', textAlign: 'center' }}>
              <span style={{ color: V.t3, fontSize: 12 }}>Nenhum checkout criado</span>
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
                      Vendas
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
                      Parcelas
                    </div>
                    <div style={{ fontFamily: M, fontSize: 12, color: V.t, marginTop: 4 }}>
                      Até {checkout.installments}x
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
                      Itens
                    </div>
                    <div style={{ fontSize: 12, color: V.t2, marginTop: 4 }}>
                      {checkout.quantity} item{checkout.quantity === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <IconActionButton
                    label="Editar"
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
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label="Duplicar"
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
                      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label="Excluir"
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
                      <path d="M3 6h18" />
                      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                      <path d="M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
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
              <span style={{ color: V.t3, fontSize: 12 }}>Nenhum checkout criado</span>
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
                    Até {checkout.installments}x
                  </span>
                  <span style={{ fontSize: 10, color: V.t3 }}>
                    {checkout.quantity} item{checkout.quantity === 1 ? '' : 's'}
                  </span>
                </div>
                <Bg color={checkout.active ? V.g : V.r}>{checkout.active ? 'ATIVO' : 'OFF'}</Bg>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <IconActionButton
                    label="Editar"
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
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label="Duplicar"
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
                      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                    </svg>
                  </IconActionButton>
                  <IconActionButton
                    label="Excluir"
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
                      <path d="M3 6h18" />
                      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                      <path d="M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
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

function CheckoutConfigPanel({
  ckEdit,
  rawCheckouts,
  rawPlans,
  setCkEdit,
  syncCheckoutLinks,
  updatePlan,
}: {
  ckEdit: string;
  rawCheckouts: JsonRecord[];
  rawPlans: JsonRecord[];
  setCkEdit: (value: string | null) => void;
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>;
  updatePlan: (planId: string, payload: JsonRecord) => Promise<unknown>;
}) {
  const { isMobile } = useResponsiveViewport();
  const { COUPONS } = useNerveCenterContext();
  const { showToast } = useToast();
  const {
    config: ckCfg,
    updateConfig: saveCkCfg,
    isLoading: ckLoading,
  } = useCheckoutConfig(ckEdit);
  const [ckLocal, setCkLocal] = useState<JsonRecord>({});
  const [ckSaving, setCkSaving] = useState(false);
  const [ckSaved, setCkSaved] = useState(false);
  const [linkedPlanIds, setLinkedPlanIds] = useState<string[]>([]);
  const [originalLinkedPlanIds, setOriginalLinkedPlanIds] = useState<string[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const checkoutForCk = rawCheckouts.find((checkout) => checkout.id === ckEdit);

  useEffect(() => {
    if (ckCfg) {
      setCkLocal(ckCfg as unknown as JsonRecord);
    }
  }, [ckCfg]);

  useEffect(() => {
    const nextPlanIds = Array.isArray(checkoutForCk?.checkoutLinks)
      ? (checkoutForCk.checkoutLinks as JsonRecord[])
          .map((link) => String(link?.planId || (link?.plan as JsonRecord)?.id || '').trim())
          .filter((value: string): value is string => Boolean(value))
      : [];
    const uniquePlanIds = Array.from(new Set(nextPlanIds)) as string[];
    setLinkedPlanIds(uniquePlanIds);
    setOriginalLinkedPlanIds(uniquePlanIds);
  }, [checkoutForCk]);

  const patch = (key: string, value: JsonValue) =>
    setCkLocal((current) => ({ ...current, [key]: value }));
  const selectedPlans = rawPlans.filter((planCandidate) =>
    linkedPlanIds.includes(String(planCandidate.id)),
  );
  const availablePlans = rawPlans.filter(
    (planCandidate) => !linkedPlanIds.includes(String(planCandidate.id)),
  );
  const currentConfigSignature = JSON.stringify({
    brandName: ckLocal.brandName || '',
    enableCreditCard: ckLocal.enableCreditCard !== false,
    enablePix: ckLocal.enablePix !== false,
    enableBoleto: Boolean(ckLocal.enableBoleto),
    enableCoupon: ckLocal.enableCoupon !== false,
    autoCouponCode: ckLocal.autoCouponCode || '',
    enableTimer: Boolean(ckLocal.enableTimer),
    timerMinutes: Number(ckLocal.timerMinutes || 15),
    timerMessage: ckLocal.timerMessage || '',
    accentColor: ckLocal.accentColor || '#E85D30',
  });
  const originalConfigSignature = JSON.stringify({
    brandName: ckCfg?.brandName || '',
    enableCreditCard: ckCfg?.enableCreditCard !== false,
    enablePix: ckCfg?.enablePix !== false,
    enableBoleto: Boolean(ckCfg?.enableBoleto),
    enableCoupon: ckCfg?.enableCoupon !== false,
    autoCouponCode: ckCfg?.autoCouponCode || '',
    enableTimer: Boolean(ckCfg?.enableTimer),
    timerMinutes: Number(ckCfg?.timerMinutes || 15),
    timerMessage: ckCfg?.timerMessage || '',
    accentColor: ckCfg?.accentColor || '#E85D30',
  });
  const hasUnsavedChanges =
    currentConfigSignature !== originalConfigSignature ||
    JSON.stringify(linkedPlanIds) !== JSON.stringify(originalLinkedPlanIds);

  const handleSave = async () => {
    setCkSaving(true);
    try {
      const { id, planId, plan, createdAt, updatedAt, pixels, ...rest } = ckLocal;
      await saveCkCfg(rest);
      await syncCheckoutLinks(ckEdit, linkedPlanIds);
      if (checkoutForCk && ckLocal.brandName !== checkoutForCk.name) {
        await updatePlan(ckEdit, { name: ckLocal.brandName || checkoutForCk.name });
      }
      setCkSaved(true);
      setTimeout(() => setCkSaved(false), 2000);
      showToast('Checkout salvo', 'success');
      return true;
    } catch (error) {
      console.error('Checkout config save error:', error);
      showToast(error instanceof Error ? error.message : 'Erro ao salvar checkout', 'error');
      return false;
    } finally {
      setCkSaving(false);
    }
  };

  const handleBack = async (saveBeforeExit: boolean) => {
    if (saveBeforeExit) {
      const didSave = await handleSave();
      if (!didSave) {
        return;
      }
    }
    setShowExitConfirm(false);
    setCkEdit(null);
  };

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
          ← Checkouts
        </Bt>
        <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>
          Configurações — {String(checkoutForCk?.name || 'Checkout')}
        </span>
      </div>
      {ckLoading ? (
        <PanelLoadingState
          compact
          label="Sincronizando checkout"
          description="O shell do produto permanece montado enquanto a configuração comercial é carregada."
        />
      ) : (
        <div style={{ ...cs, padding: isMobile ? 16 : 24 }}>
          <div
            style={{
              padding: '12px 14px',
              marginBottom: 16,
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.7 }}>
              Configure o checkout por preenchimento manual: nome comercial, meios de pagamento,
              cupom, urgência e planos vinculados. Ao voltar, o painel pergunta se deseja salvar as
              alterações desta edição.
            </div>
          </div>
          <Fd
            label="Nome / Descrição *"
            value={String(ckLocal.brandName ?? '')}
            onChange={(value) => patch('brandName', value)}
            full
          />
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            Pagamento
          </h4>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: V.t2,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={ckLocal.enableCreditCard !== false}
                onChange={(event) => patch('enableCreditCard', event.target.checked)}
                style={{ accentColor: V.em, width: 16, height: 16 }}
              />
              Cartão de crédito
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: V.t2,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={ckLocal.enablePix !== false}
                onChange={(event) => patch('enablePix', event.target.checked)}
                style={{ accentColor: V.em, width: 16, height: 16 }}
              />
              Pix
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: V.t2,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(ckLocal.enableBoleto)}
                onChange={(event) => patch('enableBoleto', event.target.checked)}
                style={{ accentColor: V.em, width: 16, height: 16 }}
              />
              Boleto
            </label>
          </div>
          <Dv />
          <Tg
            label="Cupom de desconto?"
            checked={ckLocal.enableCoupon !== false}
            onChange={(value) => patch('enableCoupon', value)}
          />
          {ckLocal.enableCoupon !== false ? (
            <Fd label="Cupom automático">
              <select
                style={is}
                value={String(ckLocal.autoCouponCode ?? '')}
                onChange={(event) => patch('autoCouponCode', event.target.value)}
              >
                <option value="">Selecione um cupom...</option>
                {COUPONS.map((coupon) => (
                  <option key={coupon.id} value={coupon.code}>
                    {coupon.code} ({coupon.type}
                    {coupon.type === '%'
                      ? `${coupon.val}% OFF`
                      : `R$ ${Number(coupon.val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} OFF`}
                    )
                  </option>
                ))}
              </select>
            </Fd>
          ) : null}
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            Contador
          </h4>
          <Tg
            label="Usar contador?"
            checked={Boolean(ckLocal.enableTimer)}
            onChange={(value) => patch('enableTimer', value)}
          />
          {ckLocal.enableTimer ? (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
              <Fd
                label="Minutos"
                value={String(ckLocal.timerMinutes || 15)}
                onChange={(value) => patch('timerMinutes', Number.parseInt(value, 10) || 15)}
              />
              <Fd
                label="Mensagem"
                value={String(ckLocal.timerMessage ?? '')}
                onChange={(value) => patch('timerMessage', value)}
              />
            </div>
          ) : null}
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            Personalizar
          </h4>
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: V.t3,
                marginBottom: 4,
                display: 'block',
              }}
            >
              Cor principal
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={String(ckLocal.accentColor ?? '#E85D30')}
                onChange={(e) => patch('accentColor', e.target.value)}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={String(ckLocal.accentColor ?? '#E85D30')}
                onChange={(e) => patch('accentColor', e.target.value)}
                style={{
                  flex: 1,
                  background: V.e,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: V.t,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
                placeholder="#E85D30"
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: V.t3,
                marginBottom: 4,
                display: 'block',
              }}
            >
              Cor fundo
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={String(
                  ckLocal.backgroundColor || (ckLocal.theme === 'NOIR' ? '#0A0A0C' : '#ffffff'),
                )}
                onChange={(e) => patch('backgroundColor', e.target.value)}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={String(
                  ckLocal.backgroundColor || (ckLocal.theme === 'NOIR' ? '#0A0A0C' : '#ffffff'),
                )}
                onChange={(e) => patch('backgroundColor', e.target.value)}
                style={{
                  flex: 1,
                  background: V.e,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: V.t,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
                placeholder={ckLocal.theme === 'NOIR' ? '#0A0A0C' : '#ffffff'}
              />
            </div>
          </div>
          <Fd
            label="Texto do botão"
            value={String(ckLocal.btnFinalizeText ?? 'Finalizar compra')}
            onChange={(value) => patch('btnFinalizeText', value)}
            full
          />
          <Fd label="Layout">
            <select
              style={is}
              value={String(ckLocal.theme ?? 'BLANC')}
              onChange={(event) => patch('theme', event.target.value)}
            >
              <option value="NOIR">Noir (Escuro)</option>
              <option value="BLANC">Blanc (Claro)</option>
            </select>
          </Fd>
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            Planos vinculados
          </h4>
          {selectedPlans.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {selectedPlans.map((planCandidate) => (
                <button
                  key={String(planCandidate.id)}
                  type="button"
                  onClick={() =>
                    setLinkedPlanIds((current) =>
                      current.filter((candidateId) => candidateId !== String(planCandidate.id)),
                    )
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: `1px solid ${V.em}35`,
                    background: `${V.em}12`,
                    color: V.t,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <span>{String(planCandidate.name)}</span>
                  <span style={{ color: V.em, fontFamily: M }}>
                    {formatBrlCents(Number(planCandidate.priceInCents || 0))}
                  </span>
                  <span style={{ color: V.t3 }}>×</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ ...cs, padding: 14, marginBottom: 14, background: V.e }}>
              <span style={{ display: 'block', fontSize: 12, color: V.t, marginBottom: 6 }}>
                Nenhum plano vinculado
              </span>
              <span style={{ display: 'block', fontSize: 11, color: V.t2, lineHeight: 1.6 }}>
                Este checkout ainda não gera links públicos. Vincule pelo menos um plano para
                liberar URLs de compra em `Planos → Ver links`.
              </span>
            </div>
          )}
          {rawPlans.length === 0 ? (
            <div
              style={{
                ...cs,
                padding: 14,
                background: `${V.y}10`,
                border: `1px solid ${V.y}25`,
                marginBottom: 14,
              }}
            >
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: V.t }}>
                Nenhum plano criado
              </span>
              <span style={{ display: 'block', fontSize: 11, color: V.t2, lineHeight: 1.6 }}>
                Crie ao menos um plano em <strong style={{ color: V.t }}>Planos</strong> antes de
                vincular este checkout.
              </span>
            </div>
          ) : null}
          {availablePlans.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              {availablePlans.map((planCandidate) => (
                <button
                  key={String(planCandidate.id)}
                  type="button"
                  onClick={() =>
                    setLinkedPlanIds((current) => {
                      const pid = String(planCandidate.id);
                      return current.includes(pid) ? current : [...current, pid];
                    })
                  }
                  style={{
                    ...cs,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: V.e,
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: V.t }}>
                      {String(planCandidate.name)}
                    </span>
                    <span style={{ fontSize: 10, color: V.t3 }}>
                      {formatBrlCents(Number(planCandidate.priceInCents || 0))} ·{' '}
                      {Number(planCandidate.quantity || 1)} item
                      {Number(planCandidate.quantity || 1) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Bg color={V.g2}>Adicionar</Bg>
                </button>
              ))}
            </div>
          ) : null}
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            Social Proof
          </h4>
          <Tg
            label="Depoimentos?"
            checked={ckLocal.enableTestimonials !== false}
            onChange={(value) => patch('enableTestimonials', value)}
          />
          <Tg
            label="Garantia?"
            checked={ckLocal.enableGuarantee !== false}
            onChange={(value) => patch('enableGuarantee', value)}
          />
          <Dv />
          <Tg
            label="Popup Exit Intent?"
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
              ← Voltar
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
        <Modal title="Salvar alterações?" onClose={() => setShowExitConfirm(false)}>
          <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.7 }}>
            Se voce sair agora sem salvar, as alteracoes desta edicao serao descartadas.
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column-reverse' : 'row',
              gap: 10,
              marginTop: 18,
              justifyContent: 'flex-end',
            }}
          >
            <Bt onClick={() => void handleBack(false)}>Nao</Bt>
            <Bt primary onClick={() => void handleBack(true)}>
              Sim
            </Bt>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
