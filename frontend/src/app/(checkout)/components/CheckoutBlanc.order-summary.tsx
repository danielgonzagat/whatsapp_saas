'use client';

import { fmt, ChDown, ChUp } from './checkout-theme-shared';
import { UI } from '@/lib/ui-tokens';
import { kloelT } from '@/lib/i18n/t';
import {
  CouponRow,
  PricingBreakdown,
  ProductThumb,
  QtyControl,
  BlancTestimonialCard,
} from './CheckoutBlanc.order-summary.parts';
import type {
  BlancColors,
  BlancInputTheme,
  BlancTestimonial,
} from './CheckoutBlanc.order-summary.parts';

export type { BlancColors, BlancInputTheme, BlancTestimonial };

interface OrderSummaryProps {
  summaryOpen: boolean;
  setSummaryOpen: (fn: (prev: boolean) => boolean) => void;
  qty: number;
  setQty: (fn: (prev: number) => number) => void;
  totalWithInterest: number;
  subtotal: number;
  shippingInCents: number;
  discount: number;
  couponApplied: boolean;
  payMethod: string;
  pricing: { installmentInterestInCents: number };
  couponCode: string;
  setCouponCode: (v: string) => void;
  couponError: string | null;
  applyCoupon: () => Promise<void>;
  productName: string;
  unitPriceInCents: number;
  productImage: string | null;
  testimonials: BlancTestimonial[];
  colors: BlancColors;
  inputTheme: BlancInputTheme;
  enableCoupon?: boolean;
}

/** Mobile collapsible summary (ck-mobile-only) */
export function BlancMobileSummary({
  summaryOpen,
  setSummaryOpen,
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
  applyCoupon,
  productName,
  unitPriceInCents,
  productImage,
  colors,
  inputTheme,
  enableCoupon,
}: OrderSummaryProps) {
  return (
    <div
      className="ck-mobile-only"
      style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 16px' }}
    >
      <div
        style={{
          background: UI.bg,
          borderRadius: UI.radiusMd,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          style={{
            width: '100%',
            padding: '16px 20px',
            background: 'transparent',
            border: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: UI.text,
          }}
        >
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>
              {kloelT(`RESUMO (`)}
              {qty})
            </span>
            <br />
            <span style={{ fontSize: 12, color: UI.muted, fontWeight: 400 }}>
              {kloelT(`Informações da sua compra`)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: UI.muted }}>
              {fmt.brl(totalWithInterest)}
            </span>
            {summaryOpen ? <ChUp /> : <ChDown />}
          </div>
        </button>
        {summaryOpen ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 6 }}>
              <ProductThumb
                productImage={productImage}
                productName={productName}
                size={72}
                muted={colors.muted}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: UI.muted,
                    lineHeight: 1.4,
                    marginBottom: 4,
                  }}
                >
                  {productName}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: UI.text }}>
                  {fmt.brl(unitPriceInCents)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <QtyControl
                qty={qty}
                setQty={setQty}
                textColor="UI.text"
                controlColor="UI.muted"
                size="lg"
              />
            </div>
            <div style={{ height: 1, background: UI.borderSoft, marginBottom: 16 }} />
            {enableCoupon !== false ? (
              <CouponRow
                couponCode={couponCode}
                setCouponCode={setCouponCode}
                couponError={couponError}
                applyCoupon={applyCoupon}
                inputTheme={inputTheme}
              />
            ) : null}
            <PricingBreakdown
              subtotal={subtotal}
              shippingInCents={shippingInCents}
              couponApplied={couponApplied}
              discount={discount}
              payMethod={payMethod}
              pricing={pricing}
              totalWithInterest={totalWithInterest}
              accentColor={colors.accent}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Desktop sidebar with product, qty, coupon, pricing, testimonials */
export function BlancDesktopSidebar({
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
  applyCoupon,
  productName,
  unitPriceInCents,
  productImage,
  testimonials,
  colors,
  inputTheme,
  enableCoupon,
}: OrderSummaryProps) {
  return (
    <div className="ck-col ck-desktop-only" style={{ flex: '1 1 28%', minWidth: 260 }}>
      <div
        style={{
          background: UI.bg,
          border: '1px solid UI.borderSoft',
          borderRadius: UI.radiusMd,
          padding: '24px 20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>RESUMO</h3>

        {enableCoupon !== false ? (
          <>
            <CouponRow
              couponCode={couponCode}
              setCouponCode={setCouponCode}
              couponError={couponError}
              applyCoupon={applyCoupon}
              inputTheme={inputTheme}
            />
            {!couponError ? <div style={{ marginBottom: 12 }} /> : null}
          </>
        ) : null}

        <PricingBreakdown
          subtotal={subtotal}
          shippingInCents={shippingInCents}
          couponApplied={couponApplied}
          discount={discount}
          payMethod={payMethod}
          pricing={pricing}
          totalWithInterest={totalWithInterest}
          accentColor={colors.accent}
        />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginTop: 24 }}>
          <ProductThumb
            productImage={productImage}
            productName={productName}
            size={72}
            muted={colors.muted}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: UI.muted,
                lineHeight: 1.4,
                marginBottom: 4,
              }}
            >
              {productName}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: UI.text, marginBottom: 10 }}>
              {fmt.brl(unitPriceInCents)}
            </div>
            <QtyControl
              qty={qty}
              setQty={setQty}
              textColor="UI.text"
              controlColor="UI.borderSoft"
              size="sm"
            />
          </div>
        </div>
      </div>

      {testimonials.map((t) => (
        <BlancTestimonialCard key={`${t.name}-${t.text.slice(0, 24)}`} testimonial={t} />
      ))}
    </div>
  );
}
