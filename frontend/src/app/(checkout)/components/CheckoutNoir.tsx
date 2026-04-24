'use client';

import { kloelT } from '@/lib/i18n/t';
import type {
  PublicCheckoutTestimonial,
  PublicCheckoutThemeProps,
} from '@/lib/public-checkout-contract';
import type * as React from 'react';
import { useId } from 'react';
import { useCheckoutExperience } from '../hooks/useCheckoutExperience';
import PixelTracker from './PixelTracker';
import {
  type CheckoutThemeInputTokens,
  type CheckoutThemeStepTokens,
  PAYMENT_BADGES,
  StepBubble as SharedStepBubble,
  StepLine as SharedStepLine,
  buildFooterPrimaryLine,
  fmt,
  formatCnpj,
  normalizeTestimonials as normalizeThemeTestimonials,
} from './checkout-theme-shared';
import { NoirAddressStep } from './CheckoutNoir.address-step';
import { NoirIdentityStep } from './CheckoutNoir.identity-step';
import { NoirCouponPopup, NoirSuccessModal } from './CheckoutNoir.modals';
import {
  NoirDesktopSidebar,
  NoirMobileSummary,
  type NoirColors,
  type NoirInputTheme,
} from './CheckoutNoir.order-summary';
import { NoirPaymentStep } from './CheckoutNoir.payment-step';

type CheckoutNoirProps = PublicCheckoutThemeProps;

const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

const DEFAULT_TESTIMONIALS = [
  {
    name: 'Patrícia Almeida',
    stars: 5,
    text: 'Eu já tinha testado de tudo contra os calorões e nada resolvia. MenoPlex foi a primeira coisa que realmente fez diferença.',
    avatar: 'PA',
  },
  {
    name: 'Simone Silva',
    stars: 5,
    text: 'Não precisava falar mas esse remédio salvou meu casamento. Parei de ficar irritada e minha libido melhorou. Só compro 6 agora, quero meu desconto.',
    avatar: 'SS',
  },
  {
    name: 'Fátima Pereira',
    stars: 5,
    text: 'Eu adorei o envio deles, chegou super rápido. Produtos lindos e caixa personalizada.',
    avatar: 'FP',
  },
];

const DEFAULT_C = {
  void: '#0a0a0f',
  surface: '#12121a',
  surface2: '#1a1a25',
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.1)',
  text: '#e8e8ed',
  text2: 'rgba(255,255,255,0.55)',
  text3: 'rgba(255,255,255,0.3)',
  accent: '#D4A574',
  accent2: '#E8C4A0',
  green: '#10b981',
} as const;

const normalizeTestimonials = (
  brandName: string,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) => normalizeThemeTestimonials(brandName, DEFAULT_TESTIMONIALS, testimonials, enabled);

/** Checkout noir — dark theme. */
export default function CheckoutNoir({
  product,
  config,
  plan,
  workspaceId,
  checkoutCode,
  paymentProvider,
  affiliateContext,
  merchant,
}: CheckoutNoirProps) {
  const fid = useId();
  const {
    step,
    setStep,
    summaryOpen,
    setSummaryOpen,
    couponCode,
    setCouponCode,
    couponApplied,
    discount,
    payMethod,
    setPayMethod,
    showSuccess,
    successOrderNumber,
    qty,
    setQty,
    loadingStep,
    isSubmitting,
    couponError,
    showCouponPopup,
    setShowCouponPopup,
    setCouponPopupHandled,
    submitError,
    pixelEvent,
    form,
    productName,
    brandName,
    unitPriceInCents,
    shippingInCents,
    supportsCard,
    supportsPix,
    supportsBoleto,
    productImage,
    checkoutUnavailableReason,
    testimonials,
    pixels,
    subtotal,
    total,
    pricing,
    totalWithInterest,
    installmentOptions,
    footerPrimary,
    footerSecondary,
    footerLegal,
    mobileCanOpenStep1,
    mobileCanOpenStep2,
    headerPrimary,
    headerSecondary,
    popupCouponCode,
    updateField,
    goStep,
    applyCoupon,
    finalizeOrder,
  } = useCheckoutExperience({
    product,
    config,
    plan,
    workspaceId,
    checkoutCode,
    paymentProvider,
    affiliateContext,
    merchant,
    defaults: { product: DEFAULT_PRODUCT, testimonials: DEFAULT_TESTIMONIALS },
    helpers: { fmt, normalizeTestimonials, buildFooterPrimaryLine, formatCnpj },
  });

  const C: NoirColors = {
    ...DEFAULT_C,
    void: config?.backgroundColor || DEFAULT_C.void,
    surface: config?.cardColor || DEFAULT_C.surface,
    text: config?.textColor || DEFAULT_C.text,
    text2: config?.mutedTextColor || DEFAULT_C.text2,
    accent: config?.accentColor || DEFAULT_C.accent,
    accent2: config?.accentColor2 || config?.accentColor || DEFAULT_C.accent2,
  };

  const stepTheme: CheckoutThemeStepTokens = {
    activeBubbleBg: C.accent,
    lockedBubbleBg: C.surface2,
    activeLabelColor: C.text,
    lockedLabelColor: C.text3,
    activeShadow: `0 2px 12px ${C.accent}4d`,
    lineActive: C.green,
    lineInactive: C.border2,
  };

  const inputTheme: NoirInputTheme = {
    background: C.surface2,
    border: C.border2,
    text: C.text,
    radius: 6,
    focusBorder: C.accent,
    focusShadow: `0 0 0 2px ${C.accent}26`,
    tagStroke: C.text3,
    editStroke: C.text3,
  };

  const doneCard: React.CSSProperties = {
    background: 'rgba(16,185,129,0.04)',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: 20,
  };

  const activeCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border2}`,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: '24px 20px',
    animation: 'fadeIn 0.3s',
  };

  const lockedCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '24px 20px',
    opacity: 0.35,
  };

  const numDone: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.green,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const numActive: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const numLock: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.surface2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Type adapters — the sub-files use looser string-based signatures for portability.
  const updateFieldStr = updateField as (
    field: string,
  ) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  const setPayMethodStr = setPayMethod as (m: string) => void;
  const installmentOptionsStr = installmentOptions.map((o) => ({ ...o, value: String(o.value) }));
  const applyCouponVoid = applyCoupon as unknown as (code?: string) => Promise<void>;
  const finalizeOrderVoid = finalizeOrder as () => Promise<void>;

  const sharedSummaryProps = {
    qty,
    setQty,
    totalWithInterest,
    subtotal,
    shippingInCents,
    discount,
    couponApplied,
    payMethod,
    pricing,
    couponCode,
    setCouponCode,
    couponError,
    applyCoupon: applyCouponVoid,
    productName,
    unitPriceInCents,
    productImage,
    C,
    inputTheme,
    enableCoupon: config?.enableCoupon,
    testimonials,
  };

  const stepCardProps = { doneCard, activeCard, lockedCard, numDone, numActive, numLock };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.void,
        fontFamily: "'DM Sans',sans-serif",
        color: C.text,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box}button{cursor:pointer}input::placeholder{color:rgba(255,255,255,0.2)!important}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes modalIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}.ck-mobile-only{display:none}@media(max-width:900px){.ck-main{flex-direction:column!important}.ck-col{flex:1 1 100%!important;min-width:0!important}.ck-mobile-only{display:block!important}.ck-desktop-only{display:none!important}.ck-lock-text{display:none!important}}`}</style>

      {pixelEvent && pixels.length > 0 ? <PixelTracker pixels={pixels} event={pixelEvent} /> : null}

      <header
        style={{
          background: 'linear-gradient(135deg,#1a0a14,#2d1525,#1a0a14)',
          padding: '22px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 300,
              color: '#fff',
              letterSpacing: '0.02em',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            {brandName}
          </div>
          <div
            style={{
              position: 'absolute',
              right: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#fff',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="rgba(255,255,255,0.7)"
              stroke="none"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path
                d={kloelT(`M7 11V7a5 5 0 0110 0v4`)}
                fill="none"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth="2"
              />
            </svg>
            <div className="ck-lock-text">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  lineHeight: 1.1,
                  color: '#fff',
                }}
              >
                PAGAMENTO
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  letterSpacing: '0.1em',
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                {kloelT(`100% SEGURO`)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          background: C.surface,
          padding: '10px 24px',
          textAlign: 'center',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{headerPrimary}</div>
        <div style={{ fontSize: 13, color: C.text2 }}>{headerSecondary}</div>
      </div>

      <div
        style={{
          maxWidth: 500,
          margin: '24px auto 0',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'flex-start',
        }}
      >
        <SharedStepBubble
          n={1}
          state={step === 1 ? 'active' : step > 1 ? 'done' : 'locked'}
          onClick={() => {
            if (mobileCanOpenStep1) goStep(1);
          }}
          label={kloelT(`Informações pessoais`)}
          theme={stepTheme}
        />
        <SharedStepLine active={step > 1} theme={stepTheme} />
        <SharedStepBubble
          n={2}
          state={step === 2 ? 'active' : step > 2 ? 'done' : 'locked'}
          onClick={() => {
            if (mobileCanOpenStep2) goStep(2);
          }}
          label={kloelT(`Entrega`)}
          theme={stepTheme}
        />
        <SharedStepLine active={step > 2} theme={stepTheme} />
        <SharedStepBubble
          n={3}
          state={step >= 3 ? 'active' : 'locked'}
          onClick={step >= 3 ? () => goStep(3) : undefined}
          label={kloelT(`Pagamento`)}
          theme={stepTheme}
        />
      </div>

      <NoirMobileSummary
        {...sharedSummaryProps}
        summaryOpen={summaryOpen}
        setSummaryOpen={setSummaryOpen}
      />

      <main
        className="ck-main"
        style={{
          maxWidth: 1200,
          margin: '20px auto 40px',
          padding: '0 24px',
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
          <NoirIdentityStep
            fid={fid}
            step={step}
            form={form}
            C={C}
            inputTheme={inputTheme}
            submitError={submitError}
            loadingStep={loadingStep}
            phoneLabel={config?.phoneLabel}
            btnStep1Text={config?.btnStep1Text}
            setStep={setStep}
            updateField={updateFieldStr}
            goStep={goStep}
            {...stepCardProps}
          />
          <NoirAddressStep
            fid={fid}
            step={step}
            form={form}
            C={C}
            inputTheme={inputTheme}
            submitError={submitError}
            shippingInCents={shippingInCents}
            btnStep2Text={config?.btnStep2Text}
            setStep={setStep}
            updateField={updateFieldStr}
            goStep={goStep}
            {...stepCardProps}
          />
        </div>

        <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
          <NoirPaymentStep
            fid={fid}
            step={step}
            checkoutUnavailableReason={checkoutUnavailableReason}
            supportsCard={supportsCard}
            supportsPix={supportsPix}
            supportsBoleto={supportsBoleto}
            payMethod={payMethod}
            setPayMethod={setPayMethodStr}
            form={form}
            updateField={updateFieldStr}
            installmentOptions={installmentOptionsStr}
            pricing={pricing}
            total={total}
            isSubmitting={isSubmitting}
            submitError={submitError}
            finalizeOrder={finalizeOrderVoid}
            C={C}
            inputTheme={inputTheme}
            btnFinalizeText={config?.btnFinalizeText}
            fmt={fmt}
          />
        </div>

        <NoirDesktopSidebar
          {...sharedSummaryProps}
          summaryOpen={summaryOpen}
          setSummaryOpen={setSummaryOpen}
        />
      </main>

      <footer
        style={{
          background: C.void,
          borderTop: `1px solid ${C.border}`,
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {config?.showPaymentIcons !== false ? (
            <>
              <div style={{ fontSize: 14, color: C.text3, marginBottom: 14 }}>
                {kloelT(`Formas de pagamento`)}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 24,
                }}
              >
                {PAYMENT_BADGES.filter((item) => {
                  if (item === 'Pix') return supportsPix;
                  if (item === 'Boleto') return supportsBoleto;
                  return supportsCard;
                }).map((code) => (
                  <span
                    key={code}
                    style={{
                      padding: '6px 14px',
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.text3,
                    }}
                  >
                    {code}
                  </span>
                ))}
              </div>
            </>
          ) : null}
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 4 }}>{footerPrimary}</div>
          {footerSecondary ? (
            <div style={{ fontSize: 13, color: C.text3, marginBottom: 4 }}>{footerSecondary}</div>
          ) : null}
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>{footerLegal}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill={C.text3}
              stroke="none"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path
                d={kloelT(`M7 11V7a5 5 0 0110 0v4`)}
                fill="none"
                stroke={C.text3}
                strokeWidth="2"
              />
            </svg>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.text2,
                  letterSpacing: '0.1em',
                  lineHeight: 1.1,
                }}
              >
                PAGAMENTO
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  color: C.text3,
                  letterSpacing: '0.1em',
                  lineHeight: 1.5,
                }}
              >
                {kloelT(`100% SEGURO`)}
              </div>
            </div>
          </div>
        </div>
      </footer>

      {showCouponPopup ? (
        <NoirCouponPopup
          popupCouponCode={popupCouponCode}
          couponError={couponError}
          C={C}
          inputTheme={inputTheme}
          couponPopupTitle={config?.couponPopupTitle}
          couponPopupDesc={config?.couponPopupDesc}
          couponPopupDismiss={config?.couponPopupDismiss}
          couponPopupBtnText={config?.couponPopupBtnText}
          setShowCouponPopup={setShowCouponPopup}
          setCouponPopupHandled={setCouponPopupHandled}
          applyCoupon={applyCouponVoid}
        />
      ) : null}

      {showSuccess ? <NoirSuccessModal successOrderNumber={successOrderNumber} C={C} /> : null}
    </div>
  );
}
