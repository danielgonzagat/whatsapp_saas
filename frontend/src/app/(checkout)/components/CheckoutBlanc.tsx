'use client';

import type * as React from 'react';
import PixelTracker from './PixelTracker';
import {
  Bc,
  buildFooterPrimaryLine,
  ChDown,
  Chk,
  ChUp,
  clampQty,
  Cc,
  Ed as SharedEd,
  fmt,
  formatCnpj,
  Mn,
  normalizeTestimonials as normalizeThemeTestimonials,
  PAYMENT_BADGES,
  Pl,
  Px,
  Star,
  StepBubble as SharedStepBubble,
  StepLine as SharedStepLine,
  Tag as SharedTag,
  ValidationInput as SharedValidationInput,
  type CheckoutThemeInputTokens,
  type CheckoutThemeStepTokens,
} from './checkout-theme-shared';
import { useCheckoutExperience } from '../hooks/useCheckoutExperience';
import type {
  PublicCheckoutMerchantInfo,
  PublicCheckoutTestimonial,
  PublicCheckoutThemeProps,
} from '@/lib/public-checkout-contract';

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

const DEFAULT_STEP_THEME: CheckoutThemeStepTokens = {
  activeBubbleBg: '#1a1a1a',
  lockedBubbleBg: '#d1d5db',
  activeLabelColor: '#1a1a1a',
  lockedLabelColor: '#999',
  activeShadow: '0 2px 10px rgba(0,0,0,0.2)',
  lineActive: '#10b981',
  lineInactive: '#e5e7eb',
};

const DEFAULT_INPUT_THEME: CheckoutThemeInputTokens = {
  background: '#fff',
  border: '#d1d5db',
  text: '#1a1a1a',
  radius: 8,
  focusBorder: '#10b981',
  focusShadow: '0 0 0 2px rgba(16,185,129,0.12)',
  tagStroke: '#bbb',
  editStroke: '#999',
};

const normalizeTestimonials = (
  brandName: string,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) => normalizeThemeTestimonials(brandName, DEFAULT_TESTIMONIALS, testimonials, enabled);

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
    defaults: {
      product: DEFAULT_PRODUCT,
      testimonials: DEFAULT_TESTIMONIALS,
    },
    helpers: {
      fmt,
      normalizeTestimonials,
      buildFooterPrimaryLine,
      formatCnpj,
    },
  });

  /* ── Dynamic color palette from checkout config ── */
  const colors = {
    accent: config?.accentColor || '#10b981',
    accent2: config?.accentColor2 || config?.accentColor || '#10b981',
    bg: config?.backgroundColor || '#f5f5f5',
    card: config?.cardColor || '#fff',
    text: config?.textColor || '#1a1a1a',
    muted: config?.mutedTextColor || '#6b7280',
  };

  const stepTheme: CheckoutThemeStepTokens = {
    ...DEFAULT_STEP_THEME,
    lineActive: colors.accent,
  };

  const inputTheme: CheckoutThemeInputTokens = {
    ...DEFAULT_INPUT_THEME,
    background: colors.card,
    focusBorder: colors.accent,
    focusShadow: `0 0 0 2px ${colors.accent}1f`,
  };

  /* Wrapper components removed — use Shared* directly with theme props */

  const L: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    marginBottom: 6,
  };

  const renderProductThumb = (size = 72) =>
    productImage ? (
      <img
        src={productImage}
        alt={productName}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          background: '#f9fafb',
        }}
      />
    ) : (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 32,
        }}
      >
        📦
      </div>
    );

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
              fill="rgba(255,255,255,0.8)"
              stroke="none"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path
                d="M7 11V7a5 5 0 0110 0v4"
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
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                100% SEGURO
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
          label="Informações pessoais"
          theme={stepTheme}
        />
        <SharedStepLine active={step > 1} theme={stepTheme} />
        <SharedStepBubble
          n={2}
          state={step === 2 ? 'active' : step > 2 ? 'done' : 'locked'}
          onClick={() => {
            if (mobileCanOpenStep2) goStep(2);
          }}
          label="Entrega"
          theme={stepTheme}
        />
        <SharedStepLine active={step > 2} theme={stepTheme} />
        <SharedStepBubble
          n={3}
          state={step >= 3 ? 'active' : 'locked'}
          onClick={() => undefined}
          label="Pagamento"
          theme={stepTheme}
        />
      </div>

      <div
        className="ck-mobile-only"
        style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 16px' }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setSummaryOpen((value) => !value)}
            style={{
              width: '100%',
              padding: '16px 20px',
              background: 'transparent',
              border: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#1a1a1a',
            }}
          >
            <div>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>
                RESUMO ({qty})
              </span>
              <br />
              <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>
                Informações da sua compra
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: '#999' }}>
                {fmt.brl(totalWithInterest)}
              </span>
              {summaryOpen ? <ChUp /> : <ChDown />}
            </div>
          </button>
          {summaryOpen ? (
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 6 }}>
                {renderProductThumb(72)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 400,
                      color: '#999',
                      lineHeight: 1.4,
                      marginBottom: 4,
                    }}
                  >
                    {productName}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
                    {fmt.brl(unitPriceInCents)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#f4f6f8',
                    borderRadius: 24,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setQty((value) => clampQty(value - 1))}
                    style={{
                      padding: '10px 22px',
                      background: 'transparent',
                      border: 'none',
                      color: '#999',
                      fontSize: 18,
                    }}
                  >
                    <Mn />
                  </button>
                  <span
                    style={{
                      padding: '10px 24px',
                      fontSize: 17,
                      fontWeight: 700,
                      color: '#1a1a1a',
                    }}
                  >
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty((value) => clampQty(value + 1))}
                    style={{
                      padding: '10px 22px',
                      background: 'transparent',
                      border: 'none',
                      color: '#999',
                      fontSize: 18,
                    }}
                  >
                    <Pl />
                  </button>
                </div>
              </div>
              <div style={{ height: 1, background: '#eee', marginBottom: 16 }} />
              {config?.enableCoupon !== false ? (
                <>
                  <div
                    style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 10 }}
                  >
                    Tem um cupom?
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0 14px',
                        border: '1px solid #e5e7eb',
                        borderRadius: 24,
                        background: '#fff',
                        minWidth: 0,
                      }}
                    >
                      <SharedTag stroke={inputTheme.tagStroke} />
                      <input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="Código do cupom"
                        style={{
                          flex: 1,
                          padding: '12px 0',
                          border: 'none',
                          fontSize: 14,
                          outline: 'none',
                          background: 'transparent',
                          fontFamily: "'DM Sans',sans-serif",
                          minWidth: 0,
                        }}
                      />
                    </div>
                    <button
                      onClick={() => void applyCoupon()}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6366f1',
                        fontSize: 15,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      Aplicar
                    </button>
                  </div>
                  {couponError ? (
                    <div style={{ fontSize: 12, color: '#d14343', marginBottom: 10 }}>
                      {couponError}
                    </div>
                  ) : null}
                </>
              ) : null}
              <div
                style={{
                  background: '#f4f6f8',
                  borderRadius: 10,
                  padding: '16px 18px',
                  borderLeft: '3px solid #e0d5c8',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#1a1a1a',
                    marginBottom: 8,
                  }}
                >
                  <span>Produtos</span>
                  <span>{fmt.brl(subtotal)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#1a1a1a',
                    marginBottom: 8,
                  }}
                >
                  <span>Frete</span>
                  <span>{shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}</span>
                </div>
                {couponApplied ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 15,
                      color: colors.accent,
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <span>Desconto</span>
                    <span>-{fmt.brl(discount)}</span>
                  </div>
                ) : null}
                {payMethod === 'card' && pricing.installmentInterestInCents > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 15,
                      color: '#7c6f61',
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <span>Juros do parcelamento</span>
                    <span>{fmt.brl(pricing.installmentInterestInCents)}</span>
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  <span style={{ fontSize: 15, color: '#d4b896', fontWeight: 400 }}>Total</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#d4b896' }}>
                    {fmt.brl(totalWithInterest)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

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
          {step > 1 ? (
            <div
              style={{
                background: '#f0fdf4',
                borderRadius: 10,
                padding: 20,
                animation: 'fadeIn 0.3s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: colors.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>1</span>
                </div>
                <span style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
                  Identificação
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: '#999',
                    padding: 4,
                  }}
                >
                  <SharedEd stroke={inputTheme.editStroke} />
                </button>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{form.name || 'Nome'}</div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                {form.email}
                <br />
                CPF {form.cpf}
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
                borderRadius: 10,
                padding: '24px 20px',
                animation: 'fadeIn 0.3s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: '#1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>1</span>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>Identificação</h2>
              </div>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 1.5 }}>
                Utilizaremos seu e-mail para identificar seu pedido, confirmar a compra e enviar
                atualizações.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label htmlFor="checkout-name" style={L}>
                    Nome completo
                  </label>
                  <SharedValidationInput
                    theme={inputTheme}
                    id="checkout-name"
                    value={form.name}
                    onChange={updateField('name')}
                    placeholder="ex.: Maria de Almeida Cruz"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-email" style={L}>
                    E-mail
                  </label>
                  <SharedValidationInput
                    theme={inputTheme}
                    id="checkout-email"
                    value={form.email}
                    onChange={updateField('email')}
                    placeholder="ex.: maria@gmail.com"
                    type="email"
                  />
                </div>
                <div style={{ width: 'fit-content', minWidth: 220 }}>
                  <label htmlFor="checkout-cpf" style={L}>
                    CPF
                  </label>
                  <SharedValidationInput
                    theme={inputTheme}
                    id="checkout-cpf"
                    value={form.cpf}
                    onChange={updateField('cpf')}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-phone" style={L}>
                    {config?.phoneLabel || 'Celular / WhatsApp'}
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 14px',
                        background: '#f9fafb',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#666',
                        flexShrink: 0,
                      }}
                    >
                      +55
                    </div>
                    <div style={{ flex: 1 }}>
                      <SharedValidationInput
                        theme={inputTheme}
                        id="checkout-phone"
                        value={form.phone}
                        onChange={updateField('phone')}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {submitError && step === 1 ? (
                <div style={{ marginTop: 14, fontSize: 13, color: '#d14343' }}>{submitError}</div>
              ) : null}
              <button
                onClick={() => goStep(2)}
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: 15,
                  background: colors.accent,
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 17,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {loadingStep ? (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }}
                  />
                ) : (
                  config?.btnStep1Text || 'Ir para Entrega'
                )}
              </button>
            </div>
          )}

          {step >= 2 ? (
            step > 2 ? (
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 20, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: colors.accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>2</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
                    Entrega
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={colors.accent}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <button
                    onClick={() => setStep(2)}
                    style={{
                      marginLeft: 'auto',
                      background: 'none',
                      border: 'none',
                      color: '#999',
                      padding: 4,
                    }}
                  >
                    <SharedEd stroke={inputTheme.editStroke} />
                  </button>
                </div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                  <strong>Endereço para entrega:</strong>
                  <br />
                  {form.street || 'Endereço'}, {form.number || 'S/N'} - {form.neighborhood}
                  <br />
                  {form.complement ? (
                    <>
                      Complemento: {form.complement}
                      <br />
                    </>
                  ) : null}
                  {[form.city, form.state].filter(Boolean).join(' - ')} | CEP {form.cep}
                  <br />
                  <strong style={{ display: 'block', marginTop: 8 }}>Forma de entrega:</strong>
                  {shippingInCents === 0
                    ? 'Frete padrão Grátis'
                    : `Frete padrão ${fmt.brl(shippingInCents)}`}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
                  borderRadius: 10,
                  padding: '24px 20px',
                  marginTop: 20,
                  animation: 'fadeIn 0.3s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>2</span>
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 700 }}>Entrega</h2>
                </div>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                  Cadastre o endereço para envio
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ minWidth: 180 }}>
                      <label htmlFor="checkout-cep" style={L}>
                        CEP
                      </label>
                      <SharedValidationInput
                        theme={inputTheme}
                        id="checkout-cep"
                        value={form.cep}
                        onChange={updateField('cep')}
                        placeholder="00000-000"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="checkout-street" style={L}>
                      Endereço
                    </label>
                    <SharedValidationInput
                      theme={inputTheme}
                      id="checkout-street"
                      value={form.street}
                      onChange={updateField('street')}
                      placeholder="Rua, avenida..."
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: '0 0 35%' }}>
                      <label htmlFor="checkout-number" style={L}>
                        Número
                      </label>
                      <SharedValidationInput
                        theme={inputTheme}
                        id="checkout-number"
                        value={form.number}
                        onChange={updateField('number')}
                        placeholder="Nº"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label htmlFor="checkout-neighborhood" style={L}>
                        Bairro
                      </label>
                      <SharedValidationInput
                        theme={inputTheme}
                        id="checkout-neighborhood"
                        value={form.neighborhood}
                        onChange={updateField('neighborhood')}
                        placeholder="Bairro"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="checkout-complement" style={L}>
                      Complemento <span style={{ opacity: 0.5, fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <SharedValidationInput
                      theme={inputTheme}
                      id="checkout-complement"
                      value={form.complement}
                      onChange={updateField('complement')}
                      placeholder="Apto, bloco..."
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label htmlFor="checkout-city" style={L}>
                        Cidade
                      </label>
                      <SharedValidationInput
                        theme={inputTheme}
                        id="checkout-city"
                        value={form.city}
                        onChange={updateField('city')}
                        placeholder="Cidade"
                      />
                    </div>
                    <div style={{ flex: '0 0 24%' }}>
                      <label htmlFor="checkout-state" style={L}>
                        UF
                      </label>
                      <SharedValidationInput
                        theme={inputTheme}
                        id="checkout-state"
                        value={form.state}
                        onChange={updateField('state')}
                        placeholder="UF"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="checkout-destinatario" style={L}>
                      Destinatário
                    </label>
                    <SharedValidationInput
                      theme={inputTheme}
                      id="checkout-destinatario"
                      value={form.destinatario}
                      onChange={updateField('destinatario')}
                      placeholder="Nome do destinatário"
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    marginTop: 18,
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: '5px solid #1a1a1a',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Frete padrão</div>
                    <div style={{ fontSize: 12, color: '#999' }}>Entrega garantida</div>
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: shippingInCents === 0 ? colors.accent : colors.text,
                    }}
                  >
                    {shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}
                  </span>
                </div>
                {submitError && step === 2 ? (
                  <div style={{ marginTop: 14, fontSize: 13, color: '#d14343' }}>{submitError}</div>
                ) : null}
                <button
                  onClick={() => goStep(3)}
                  style={{
                    width: '100%',
                    marginTop: 18,
                    padding: 15,
                    background: colors.accent,
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 17,
                    fontWeight: 700,
                  }}
                >
                  {config?.btnStep2Text || 'Ir para Pagamento'}
                </button>
              </div>
            )
          ) : (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '24px 20px',
                marginTop: 20,
                opacity: 0.35,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: '#d1d5db',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>2</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#999' }}>Entrega</h2>
              </div>
              <p style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
                Preencha suas informações pessoais para continuar
              </p>
            </div>
          )}
        </div>

        <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
          {step >= 3 ? (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
                borderRadius: 10,
                padding: '24px 20px',
                animation: 'fadeIn 0.3s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: '#1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>3</span>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>Pagamento</h2>
              </div>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                Escolha uma forma de pagamento
              </p>

              {checkoutUnavailableReason ? (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '12px 14px',
                    background: '#fff5f5',
                    border: '1px solid #fecaca',
                    borderRadius: 10,
                    fontSize: 13,
                    color: '#b91c1c',
                    lineHeight: 1.5,
                  }}
                >
                  {checkoutUnavailableReason}
                </div>
              ) : null}

              {supportsCard ? (
                <div
                  onClick={() => setPayMethod('card')}
                  style={{
                    border: `1px solid ${payMethod === 'card' ? '#1a1a1a' : '#e5e7eb'}`,
                    borderRadius: 10,
                    padding: '16px 18px',
                    marginBottom: 12,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: payMethod === 'card' ? 16 : 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: payMethod === 'card' ? '5px solid #1a1a1a' : '2px solid #d1d5db',
                        transition: 'border 0.2s',
                      }}
                    />
                    <Cc />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Cartão de crédito</span>
                  </div>
                  {payMethod === 'card' ? (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                        {PAYMENT_BADGES.filter((item) => item !== 'Pix' && item !== 'Boleto').map(
                          (brand) => (
                            <span
                              key={brand}
                              style={{
                                padding: '3px 8px',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                borderRadius: 4,
                                fontSize: 9,
                                fontWeight: 700,
                                color: '#64748b',
                              }}
                            >
                              {brand}
                            </span>
                          ),
                        )}
                      </div>
                      <div
                        style={{
                          background: 'linear-gradient(135deg,#94a3b8,#64748b)',
                          borderRadius: 12,
                          padding: 18,
                          color: '#fff',
                          fontFamily: 'monospace',
                          marginBottom: 16,
                          minHeight: 150,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 24,
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.3)',
                          }}
                        />
                        <div
                          style={{
                            display: 'flex',
                            gap: 14,
                            fontSize: 16,
                            letterSpacing: '0.12em',
                            margin: '14px 0',
                          }}
                        >
                          {[0, 1, 2, 3].map((group) => (
                            <span key={group}>{form.cardNumber.split(' ')[group] || '••••'}</span>
                          ))}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          <span>{form.cardName || 'NOME E SOBRENOME'}</span>
                          <span>
                            <span style={{ fontSize: 8 }}>validade</span> {form.cardExp || '••/••'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <label htmlFor="checkout-card-number" style={L}>
                            Número do cartão
                          </label>
                          <SharedValidationInput
                            theme={inputTheme}
                            id="checkout-card-number"
                            value={form.cardNumber}
                            onChange={updateField('cardNumber')}
                            placeholder="1234 1234 1234 1234"
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <label htmlFor="checkout-card-exp" style={L}>
                              Validade <span style={{ opacity: 0.5 }}>(mês/ano)</span>
                            </label>
                            <SharedValidationInput
                              theme={inputTheme}
                              id="checkout-card-exp"
                              value={form.cardExp}
                              onChange={updateField('cardExp')}
                              placeholder="MM/AA"
                            />
                          </div>
                          <div style={{ flex: '0 0 38%' }}>
                            <label htmlFor="checkout-card-cvv" style={L}>
                              Cód. de segurança
                            </label>
                            <SharedValidationInput
                              theme={inputTheme}
                              id="checkout-card-cvv"
                              value={form.cardCvv}
                              onChange={updateField('cardCvv')}
                              placeholder="•••"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="checkout-card-name" style={L}>
                            Nome e sobrenome do titular
                          </label>
                          <SharedValidationInput
                            theme={inputTheme}
                            id="checkout-card-name"
                            value={form.cardName}
                            onChange={updateField('cardName')}
                            placeholder="ex.: Maria de Almeida Cruz"
                          />
                        </div>
                        <div>
                          <label htmlFor="checkout-card-cpf" style={L}>
                            CPF do titular
                          </label>
                          <SharedValidationInput
                            theme={inputTheme}
                            id="checkout-card-cpf"
                            value={form.cardCpf}
                            onChange={updateField('cardCpf')}
                            placeholder="000.000.000-00"
                          />
                        </div>
                        <div>
                          <label htmlFor="checkout-installments" style={L}>
                            Nº de Parcelas
                          </label>
                          <select
                            id="checkout-installments"
                            value={form.installments}
                            onChange={updateField('installments')}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              background: '#fff',
                              border: '1px solid #d1d5db',
                              borderRadius: 8,
                              fontSize: 15,
                              color: '#1a1a1a',
                              fontFamily: "'DM Sans',sans-serif",
                              outline: 'none',
                            }}
                          >
                            {installmentOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                            {pricing.installmentInterestInCents > 0
                              ? `Juros total do parcelamento: ${fmt.brl(pricing.installmentInterestInCents)}`
                              : 'Parcelamento sem juros na opção selecionada.'}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {supportsPix ? (
                <div
                  onClick={() => setPayMethod('pix')}
                  style={{
                    border: `1px solid ${payMethod === 'pix' ? '#1a1a1a' : '#e5e7eb'}`,
                    borderRadius: 10,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: payMethod === 'pix' ? 14 : 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: payMethod === 'pix' ? '5px solid #1a1a1a' : '2px solid #d1d5db',
                        transition: 'border 0.2s',
                      }}
                    />
                    <Px />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Pix</span>
                  </div>
                  {payMethod === 'pix' ? (
                    <>
                      <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6, marginBottom: 8 }}>
                        A confirmação de pagamento é realizada em poucos minutos. Utilize o
                        aplicativo do seu banco para pagar.
                      </p>
                      <div style={{ fontSize: 15, color: '#999', marginBottom: 14 }}>
                        Valor no Pix: {fmt.brl(total)}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {supportsBoleto ? (
                <div
                  onClick={() => setPayMethod('boleto')}
                  style={{
                    border: `1px solid ${payMethod === 'boleto' ? '#1a1a1a' : '#e5e7eb'}`,
                    borderRadius: 10,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: payMethod === 'boleto' ? 14 : 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: payMethod === 'boleto' ? '5px solid #1a1a1a' : '2px solid #d1d5db',
                        transition: 'border 0.2s',
                      }}
                    />
                    <Bc />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Boleto</span>
                  </div>
                  {payMethod === 'boleto' ? (
                    <>
                      <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6, marginBottom: 8 }}>
                        O boleto é gerado com código de barras e PDF prontos para pagamento logo
                        após a confirmação.
                      </p>
                      <div style={{ fontSize: 15, color: '#999', marginBottom: 4 }}>
                        Valor no boleto: {fmt.brl(total)}
                      </div>
                      <div style={{ fontSize: 12, color: '#777' }}>
                        Compensação bancária em até 3 dias úteis.
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {submitError ? (
                <div style={{ marginTop: 14, fontSize: 13, color: '#d14343', lineHeight: 1.5 }}>
                  {submitError}
                </div>
              ) : null}

              <button
                onClick={() => void finalizeOrder()}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: 16,
                  background: colors.accent,
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 700,
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? 'Processando...' : config?.btnFinalizeText || 'Finalizar compra'}
              </button>
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '24px 20px',
                opacity: 0.35,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: '#d1d5db',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>3</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#999' }}>Pagamento</h2>
              </div>
              <p style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
                Preencha suas informações de entrega para continuar
              </p>
            </div>
          )}
        </div>

        <div className="ck-col ck-desktop-only" style={{ flex: '1 1 28%', minWidth: 260 }}>
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: '24px 20px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>RESUMO</h3>

            {config?.enableCoupon !== false ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 10 }}>
                  Tem um cupom?
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0 14px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 24,
                      background: '#fff',
                      minWidth: 0,
                    }}
                  >
                    <SharedTag stroke={inputTheme.tagStroke} />
                    <input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Código do cupom"
                      style={{
                        flex: 1,
                        padding: '12px 0',
                        border: 'none',
                        fontSize: 14,
                        outline: 'none',
                        background: 'transparent',
                        fontFamily: "'DM Sans',sans-serif",
                        minWidth: 0,
                      }}
                    />
                  </div>
                  <button
                    onClick={() => void applyCoupon()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6366f1',
                      fontSize: 15,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Aplicar
                  </button>
                </div>
                {couponError ? (
                  <div style={{ fontSize: 12, color: '#d14343', marginBottom: 12 }}>
                    {couponError}
                  </div>
                ) : (
                  <div style={{ marginBottom: 12 }} />
                )}
              </>
            ) : null}

            <div
              style={{
                background: '#f4f6f8',
                borderRadius: 10,
                padding: '16px 18px',
                marginBottom: 24,
                borderLeft: '3px solid #e0d5c8',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#1a1a1a',
                  marginBottom: 8,
                }}
              >
                <span>Produtos</span>
                <span>{fmt.brl(subtotal)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#1a1a1a',
                  marginBottom: 8,
                }}
              >
                <span>Frete</span>
                <span>{shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}</span>
              </div>
              {couponApplied ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    color: colors.accent,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  <span>Desconto</span>
                  <span>-{fmt.brl(discount)}</span>
                </div>
              ) : null}
              {payMethod === 'card' && pricing.installmentInterestInCents > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    color: '#7c6f61',
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  <span>Juros</span>
                  <span>{fmt.brl(pricing.installmentInterestInCents)}</span>
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 4,
                }}
              >
                <span style={{ fontSize: 15, color: '#d4b896', fontWeight: 400 }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#d4b896' }}>
                  {fmt.brl(totalWithInterest)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              {renderProductThumb(72)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: '#999',
                    lineHeight: 1.4,
                    marginBottom: 4,
                  }}
                >
                  {productName}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>
                  {fmt.brl(unitPriceInCents)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#f4f6f8',
                    borderRadius: 24,
                    overflow: 'hidden',
                    width: 'fit-content',
                  }}
                >
                  <button
                    onClick={() => setQty((value) => clampQty(value - 1))}
                    style={{
                      padding: '8px 18px',
                      background: 'transparent',
                      border: 'none',
                      color: '#bbb',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Mn />
                  </button>
                  <span
                    style={{ padding: '8px 20px', fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}
                  >
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty((value) => clampQty(value + 1))}
                    style={{
                      padding: '8px 18px',
                      background: 'transparent',
                      border: 'none',
                      color: '#bbb',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Pl />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {testimonials.map((testimonial, index) => (
            <div
              key={`${testimonial.name}-${index}`}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '16px 18px',
                marginTop: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#666',
                    flexShrink: 0,
                  }}
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                    {Array.from({ length: testimonial.stars }).map((_, starIndex) => (
                      <Star key={starIndex} />
                    ))}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{testimonial.name}</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>{testimonial.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer
        style={{
          background: '#f5f5f5',
          borderTop: '1px solid #e5e7eb',
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {config?.showPaymentIcons !== false ? (
            <>
              <div style={{ fontSize: 14, color: '#999', marginBottom: 14 }}>
                Formas de pagamento
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
                      background: '#fff',
                      border: '1px solid #e5e7eb',
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
          <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>{footerPrimary}</div>
          {footerSecondary ? (
            <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>{footerSecondary}</div>
          ) : null}
          <div style={{ fontSize: 13, color: '#999', marginBottom: 20 }}>{footerLegal}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#aaa" stroke="none">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" fill="none" stroke="#aaa" strokeWidth="2" />
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
                  color: '#999',
                  letterSpacing: '0.1em',
                  lineHeight: 1.5,
                }}
              >
                100% SEGURO
              </div>
            </div>
          </div>
        </div>
      </footer>

      {showCouponPopup ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(12,12,14,0.38)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#fff',
              borderRadius: 18,
              border: '1px solid rgba(17,24,39,0.08)',
              boxShadow: '0 24px 80px rgba(15,23,42,0.18)',
              padding: '28px 24px 22px',
              animation: 'modalIn 0.28s',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,#f4efe8,#efe6d8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
              }}
            >
              <SharedTag stroke={inputTheme.tagStroke} />
            </div>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>
              {config?.couponPopupTitle || 'Cupom exclusivo liberado'}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: '#666', marginBottom: 18 }}>
              {config?.couponPopupDesc ||
                'Seu desconto já está pronto para ser aplicado neste pedido.'}
            </p>
            <div
              style={{
                borderRadius: 14,
                border: '1px solid #ece7df',
                background: '#faf7f2',
                padding: '14px 16px',
                marginBottom: 18,
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8a8176',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Cupom pronto para aplicar
              </span>
              <span
                style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', letterSpacing: '.06em' }}
              >
                {popupCouponCode}
              </span>
            </div>
            {couponError ? (
              <div style={{ fontSize: 12, color: '#d14343', marginBottom: 12, lineHeight: 1.6 }}>
                {couponError}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  setShowCouponPopup(false);
                  setCouponPopupHandled(true);
                }}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#666',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {config?.couponPopupDismiss || 'Agora não'}
              </button>
              <button
                onClick={() => void applyCoupon(popupCouponCode)}
                style={{
                  flex: 1.25,
                  height: 48,
                  borderRadius: 999,
                  border: 'none',
                  background: colors.accent,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {config?.couponPopupBtnText || 'Aplicar cupom'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSuccess ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: '36px 32px',
              maxWidth: 400,
              width: '100%',
              textAlign: 'center',
              animation: 'modalIn 0.3s',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: colors.accent,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Pedido confirmado!</h3>
            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
              Seu pedido foi realizado com sucesso.
            </p>
            <div
              style={{
                marginTop: 16,
                padding: '10px 20px',
                background: '#f0fdf4',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: colors.accent,
                fontFamily: 'monospace',
              }}
            >
              {successOrderNumber || 'Pedido em processamento'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
