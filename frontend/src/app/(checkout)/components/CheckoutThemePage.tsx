'use client';

import { kloelT } from '@/lib/i18n/t';
import type { PublicCheckoutThemeProps } from '@/lib/public-checkout-contract';
import { useCheckoutExperienceSocial } from '../hooks/useCheckoutExperienceSocial';
import { CheckoutLeadSections } from './CheckoutLeadSections';
import { CheckoutPaymentSection, CheckoutSuccessModal } from './CheckoutPaymentSection';
import {
  CheckoutDesktopSidebar,
  CheckoutFooter,
  CheckoutMobileSummary,
} from './CheckoutSummarySections';
import {
  StepBubble,
  StepLine,
  buildFooterPrimaryLine,
  fmt,
  formatCnpj,
  normalizeTestimonials,
} from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

type Props = PublicCheckoutThemeProps & {
  theme: CheckoutVisualTheme;
  defaults: {
    product: { name: string; priceInCents: number; brand: string };
    testimonials: Array<{ name: string; stars: number; text: string; avatar: string }>;
  };
};

/** Checkout theme page. */
export function CheckoutThemePage({
  theme,
  defaults,
  product,
  config,
  plan,
  slug,
  workspaceId,
  checkoutCode,
  paymentProvider,
  affiliateContext,
  merchant,
}: Props) {
  const checkout = useCheckoutExperienceSocial({
    product,
    config,
    plan,
    slug,
    workspaceId,
    checkoutCode,
    paymentProvider,
    affiliateContext,
    merchant,
    defaults,
    helpers: { fmt, normalizeTestimonials, buildFooterPrimaryLine, formatCnpj },
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.pageBackground,
        fontFamily: "'DM Sans', sans-serif",
        color: theme.text,
      }}
    >
      <style>
        {'*{margin:0;padding:0;box-sizing:border-box}button{cursor:pointer}input::placeholder{color:' +
          theme.softMutedText +
          '}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes modalIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}.ck-mobile-only{display:none}@media(max-width:900px){.ck-main{flex-direction:column}.ck-col{flex:1 1 100%;min-width:0}.ck-mobile-only{display:block}.ck-desktop-only{display:none}.ck-lock-text{display:none}}'}
      </style>
      <header style={{ background: theme.headerBackground, padding: '22px 24px' }}>
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
              color: theme.headerText,
              letterSpacing: '0.02em',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {checkout.brandName}
          </div>
          <div
            style={{
              position: 'absolute',
              right: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: theme.headerText,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={theme.headerMutedText}
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path
                d="M7 11V7a5 5 0 0110 0v4"
                fill="none"
                stroke={theme.headerMutedText}
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
                  color: theme.headerText,
                }}
              >
                {kloelT('PAGAMENTO')}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  letterSpacing: '0.1em',
                  lineHeight: 1.5,
                  color: theme.headerMutedText,
                }}
              >
                {kloelT('100% SEGURO')}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          background: theme.subHeaderBackground,
          padding: '10px 24px',
          textAlign: 'center',
          borderBottom: `1px solid ${theme.subHeaderBorder}`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.subHeaderText }}>
          {checkout.headerPrimary}
        </div>
        <div style={{ fontSize: 13, color: theme.subHeaderMutedText }}>
          {checkout.headerSecondary}
        </div>
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
        <StepBubble
          n={1}
          state={checkout.step === 1 ? 'active' : checkout.step > 1 ? 'done' : 'locked'}
          onClick={checkout.mobileCanOpenStep1 ? () => checkout.setStep(1) : undefined}
          label={kloelT('Informações pessoais')}
          theme={theme.step}
        />
        <StepLine active={checkout.step > 1} theme={theme.step} />
        <StepBubble
          n={2}
          state={checkout.step === 2 ? 'active' : checkout.step > 2 ? 'done' : 'locked'}
          onClick={checkout.mobileCanOpenStep2 ? () => checkout.setStep(2) : undefined}
          label={kloelT('Entrega')}
          theme={theme.step}
        />
        <StepLine active={checkout.step > 2} theme={theme.step} />
        <StepBubble
          n={3}
          state={checkout.step >= 3 ? 'active' : 'locked'}
          label={kloelT('Pagamento')}
          theme={theme.step}
        />
      </div>

      <CheckoutMobileSummary
        theme={theme}
        summaryOpen={checkout.summaryOpen}
        setSummaryOpen={checkout.setSummaryOpen}
        qty={checkout.qty}
        setQty={checkout.setQty}
        couponCode={checkout.couponCode}
        setCouponCode={checkout.setCouponCode}
        couponApplied={checkout.couponApplied}
        discount={checkout.discount}
        subtotal={checkout.subtotal}
        shippingInCents={checkout.shippingInCents}
        totalWithInterest={checkout.totalWithInterest}
        productName={checkout.productName}
        productImage={checkout.productImage}
        unitPriceInCents={checkout.unitPriceInCents}
        testimonials={checkout.testimonials}
        fmtBrl={fmt.brl}
        onApplyCoupon={() => void checkout.applyCoupon()}
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
        <CheckoutLeadSections
          theme={theme}
          config={config}
          step={checkout.step}
          setStep={checkout.setStep}
          form={checkout.form}
          submitError={checkout.submitError}
          updateField={checkout.updateField}
          loadingStep={checkout.loadingStep}
          goStep={checkout.goStep}
          socialIdentity={checkout.socialIdentity}
          socialLoadingProvider={checkout.socialLoadingProvider}
          socialError={checkout.socialError}
          facebookAvailable={checkout.facebookAvailable}
          facebookSdkReady={checkout.facebookSdkReady}
          triggerFacebookSignIn={checkout.triggerFacebookSignIn}
          googleAvailable={checkout.googleAvailable}
          googleButtonRef={checkout.googleButtonRef}
          shippingInCents={checkout.shippingInCents}
          fmtBrl={fmt.brl}
        />
        <CheckoutPaymentSection
          theme={theme}
          config={config}
          step={checkout.step}
          payMethod={checkout.payMethod}
          setPayMethod={checkout.setPayMethod}
          supportsCard={checkout.supportsCard}
          supportsPix={checkout.supportsPix}
          supportsBoleto={checkout.supportsBoleto}
          form={checkout.form}
          updateField={checkout.updateField}
          installmentOptions={checkout.installmentOptions}
          totalWithInterest={checkout.totalWithInterest}
          fmtBrl={fmt.brl}
          submitError={checkout.submitError}
          isSubmitting={checkout.isSubmitting}
          finalizeOrder={checkout.finalizeOrder}
          stripeClientSecret={checkout.stripeClientSecret}
          stripeReturnUrl={checkout.stripeReturnUrl}
          onStripeSuccess={checkout.handleStripePaymentSuccess}
          onStripeError={checkout.handleStripePaymentError}
        />
        <CheckoutDesktopSidebar
          theme={theme}
          summaryOpen={checkout.summaryOpen}
          setSummaryOpen={checkout.setSummaryOpen}
          qty={checkout.qty}
          setQty={checkout.setQty}
          couponCode={checkout.couponCode}
          setCouponCode={checkout.setCouponCode}
          couponApplied={checkout.couponApplied}
          discount={checkout.discount}
          subtotal={checkout.subtotal}
          shippingInCents={checkout.shippingInCents}
          totalWithInterest={checkout.totalWithInterest}
          productName={checkout.productName}
          productImage={checkout.productImage}
          unitPriceInCents={checkout.unitPriceInCents}
          testimonials={checkout.testimonials}
          fmtBrl={fmt.brl}
          onApplyCoupon={() => void checkout.applyCoupon()}
        />
      </main>

      <CheckoutFooter
        theme={theme}
        brandName={checkout.brandName}
        footerPrimary={checkout.footerPrimary}
        footerSecondary={checkout.footerSecondary}
        footerLegal={checkout.footerLegal}
      />
      <CheckoutSuccessModal
        theme={theme}
        show={checkout.showSuccess}
        orderNumber={checkout.successOrderNumber}
      />
    </div>
  );
}
