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
  Star,
  StepBubble as SharedStepBubble,
  StepLine as SharedStepLine,
  buildFooterPrimaryLine,
  fmt,
  formatCnpj,
  normalizeTestimonials as normalizeThemeTestimonials,
  PAYMENT_BADGES,
} from './checkout-theme-shared';
import { BlancAddressStep } from './CheckoutBlanc.address-step';
import { BlancIdentityStep } from './CheckoutBlanc.identity-step';
import { BlancCouponPopup, BlancSuccessModal } from './CheckoutBlanc.modals';
import {
  BlancDesktopSidebar,
  BlancMobileSummary,
  type BlancColors,
  type BlancInputTheme,
} from './CheckoutBlanc.order-summary';
import { BlancPaymentStep } from './CheckoutBlanc.payment-step';

type CheckoutBlancProps = PublicCheckoutThemeProps;

const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

const DEFAULT_TESTIMONIALS = [
  {
    name: 'Patrícia Almeida',
    stars: 5,
    text: 'Recebi tudo certo e a experiência do checkout foi rápida, simples e segura.',
    avatar: 'PA',
  },
  {
    name: 'Simone Silva',
    stars: 5,
    text: 'Fluxo direto ao ponto. Consegui pagar em poucos minutos sem ficar perdida.',
    avatar: 'SS',
  },
  {
    name: 'Fátima Pereira',
    stars: 5,
    text: 'Visual muito limpo e confirmação clara do pedido. Passa confiança.',
    avatar: 'FP',
  },
];

const BLANC_STAR_SLOTS = ['one', 'two', 'three', 'four', 'five'] as const;

const BLANC = {
  white: 'rgb(255 255 255)',
  dark: 'rgb(26 26 26)',
  muted: 'rgb(110 110 115)',
  stroke: 'rgb(209 213 219)',
  softLine: 'rgb(229 231 235)',
  accent: 'rgb(16 185 129)',
  tagStroke: 'rgb(187 187 187)',
} as const;

const DEFAULT_STEP_THEME: CheckoutThemeStepTokens = {
  activeBubbleBg: BLANC.dark,
  lockedBubbleBg: BLANC.stroke,
  activeLabelColor: BLANC.dark,
  lockedLabelColor: BLANC.muted,
  activeShadow: '0 2px 10px rgba(0,0,0,0.2)',
  lineActive: BLANC.accent,
  lineInactive: BLANC.softLine,
};

const DEFAULT_INPUT_THEME: CheckoutThemeInputTokens = {
  background: BLANC.white,
  border: BLANC.stroke,
  text: BLANC.dark,
  radius: 8,
  focusBorder: BLANC.accent,
  focusShadow: '0 0 0 2px rgba(16,185,129,0.12)',
  tagStroke: BLANC.tagStroke,
  editStroke: BLANC.muted,
};

const normalizeTestimonials = (
  brandName: string,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) => normalizeThemeTestimonials(brandName, DEFAULT_TESTIMONIALS, testimonials, enabled);

/** Checkout blanc — light theme. */
export default function CheckoutBlanc({
  product,
  config,
  plan,
  workspaceId,
  checkoutCode,
  paymentProvider,
  affiliateContext,
  merchant,
}: CheckoutBlancProps) {
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

  const colors: BlancColors = {
    accent: config?.accentColor || BLANC.accent,
    accent2: config?.accentColor2 || config?.accentColor || BLANC.accent,
    bg: config?.backgroundColor || '#f5f5f5',
    card: config?.cardColor || BLANC.white,
    text: config?.textColor || '#1a1a1a',
    muted: config?.mutedTextColor || '#6b7280',
  };

  const stepTheme: CheckoutThemeStepTokens = { ...DEFAULT_STEP_THEME, lineActive: colors.accent };

  const inputTheme: BlancInputTheme = {
    ...DEFAULT_INPUT_THEME,
    background: colors.card,
    focusBorder: colors.accent,
    focusShadow: `0 0 0 2px ${colors.accent}1f`,
  };

  // Type adapters — the sub-files use looser string-based signatures for portability.
  const updateFieldStr = updateField as (
    field: string,
  ) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  const setPayMethodStr = setPayMethod as (m: string) => void;
  const installmentOptionsStr = installmentOptions.map((o) => ({ ...o, value: String(o.value) }));
  const applyCouponVoid = async (code?: string): Promise<void> => {
    await (applyCoupon as (code?: string) => Promise<unknown>)(code);
  };
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
    colors,
    inputTheme,
    enableCoupon: config?.enableCoupon,
    testimonials,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        fontFamily: "'DM Sans',sans-serif",
        color: colors.text,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box}button{cursor:pointer}input::placeholder{color:#aaa!important}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes modalIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}.ck-mobile-only{display:none}@media(max-width:900px){.ck-main{flex-direction:column!important}.ck-col{flex:1 1 100%!important;min-width:0!important}.ck-mobile-only{display:block!important}.ck-desktop-only{display:none!important}.ck-lock-text{display:none!important}}`}</style>

      {pixelEvent && pixels.length > 0 ? <PixelTracker pixels={pixels} event={pixelEvent} /> : null}

      <header
        style={{
          background: 'linear-gradient(135deg,#3d1232,#5a1a4a,#3d1232)',
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
              color: BLANC.white,
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
              color: BLANC.white,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="rgba(255,255,255,0.8)"
              stroke="none"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path
                d={kloelT(`M7 11V7a5 5 0 0110 0v4`)}
                fill="none"
                stroke="rgba(255,255,255,0.8)"
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
                  color: BLANC.white,
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
                  color: 'rgba(255,255,255,0.6)',
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
          background: '#fef9e7',
          padding: '10px 24px',
          textAlign: 'center',
          borderBottom: '1px solid #f0e6c0',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>{headerPrimary}</div>
        <div style={{ fontSize: 13 }}>{headerSecondary}</div>
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

      <BlancMobileSummary
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
          <BlancIdentityStep
            fid={fid}
            step={step}
            form={form}
            colors={colors}
            inputTheme={inputTheme}
            submitError={submitError}
            loadingStep={loadingStep}
            phoneLabel={config?.phoneLabel}
            btnStep1Text={config?.btnStep1Text}
            setStep={setStep}
            updateField={updateFieldStr}
            goStep={goStep}
          />
          <BlancAddressStep
            fid={fid}
            step={step}
            form={form}
            colors={colors}
            inputTheme={inputTheme}
            submitError={submitError}
            shippingInCents={shippingInCents}
            btnStep2Text={config?.btnStep2Text}
            setStep={setStep}
            updateField={updateFieldStr}
            goStep={goStep}
          />
        </div>

        <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
          <BlancPaymentStep
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
            colors={colors}
            inputTheme={inputTheme}
            btnFinalizeText={config?.btnFinalizeText}
            fmt={fmt}
          />
        </div>

        <BlancDesktopSidebar
          {...sharedSummaryProps}
          summaryOpen={summaryOpen}
          setSummaryOpen={setSummaryOpen}
          testimonials={testimonials}
        />
      </main>

      <footer
        style={{
          background: '#f5f5f5',
          borderTop: `1px solid ${BLANC.softLine}`,
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {config?.showPaymentIcons !== false ? (
            <>
              <div style={{ fontSize: 14, color: BLANC.muted, marginBottom: 14 }}>
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
                      background: BLANC.white,
                      border: `1px solid ${BLANC.softLine}`,
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#64748b',
                    }}
                  >
                    {code}
                  </span>
                ))}
              </div>
            </>
          ) : null}
          <div style={{ fontSize: 13, color: BLANC.muted, marginBottom: 4 }}>{footerPrimary}</div>
          {footerSecondary ? (
            <div style={{ fontSize: 13, color: BLANC.muted, marginBottom: 4 }}>
              {footerSecondary}
            </div>
          ) : null}
          <div style={{ fontSize: 13, color: BLANC.muted, marginBottom: 20 }}>{footerLegal}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="#aaa"
              stroke="none"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path
                d={kloelT(`M7 11V7a5 5 0 0110 0v4`)}
                fill="none"
                stroke="#aaa"
                strokeWidth="2"
              />
            </svg>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#666',
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
                  color: BLANC.muted,
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
        <BlancCouponPopup
          popupCouponCode={popupCouponCode}
          couponError={couponError}
          setShowCouponPopup={setShowCouponPopup}
          setCouponPopupHandled={setCouponPopupHandled}
          applyCoupon={applyCouponVoid}
          colors={colors}
          inputTheme={inputTheme}
          couponPopupTitle={config?.couponPopupTitle}
          couponPopupDesc={config?.couponPopupDesc}
          couponPopupDismiss={config?.couponPopupDismiss}
          couponPopupBtnText={config?.couponPopupBtnText}
        />
      ) : null}

      {showSuccess ? (
        <BlancSuccessModal successOrderNumber={successOrderNumber} accentColor={colors.accent} />
      ) : null}
    </div>
  );
}
