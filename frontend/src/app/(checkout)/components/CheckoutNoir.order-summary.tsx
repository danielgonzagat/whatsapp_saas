'use client';

import { fmt, ChDown, ChUp } from './checkout-theme-shared';
import { UI } from '@/lib/ui-tokens';
import { kloelT } from '@/lib/i18n/t';
import {
  NoirCouponRow,
  NoirPricingBreakdown,
  NoirProductThumb,
  NoirQtyControl,
  NoirTestimonialCard,
} from './CheckoutNoir.order-summary.parts';
import type {
  NoirColors,
  NoirInputTheme,
  NoirTestimonial,
} from './CheckoutNoir.order-summary.parts';

export type { NoirColors, NoirInputTheme, NoirTestimonial };

interface NoirOrderSummaryProps {
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
  testimonials: NoirTestimonial[];
  C: NoirColors;
  inputTheme: NoirInputTheme;
  enableCoupon?: boolean;
}

/** Mobile collapsible summary for CheckoutNoir */
export function NoirMobileSummary({
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
  C,
  inputTheme,
  enableCoupon,
}: NoirOrderSummaryProps) {
  return (
    <div
      className="ck-mobile-only"
      style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 16px' }}
    >
      <div
        style={{
          background: C.surface,
          borderRadius: UI.radiusMd,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          border: `1px solid ${C.border}`,
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
            color: C.text,
          }}
        >
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>
              {kloelT(`RESUMO (`)}
              {qty})
            </span>
            <br />
            <span style={{ fontSize: 12, color: C.text3, fontWeight: 400 }}>
              {kloelT(`Informações da sua compra`)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: C.text3 }}>
              {fmt.brl(totalWithInterest)}
            </span>
            {summaryOpen ? <ChUp /> : <ChDown />}
          </div>
        </button>
        {summaryOpen ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 6 }}>
              <NoirProductThumb
                productImage={productImage}
                productName={productName}
                size={72}
                C={C}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: C.text3,
                    lineHeight: 1.4,
                    marginBottom: 4,
                  }}
                >
                  {productName}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                  {fmt.brl(unitPriceInCents)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <NoirQtyControl qty={qty} setQty={setQty} C={C} size="lg" />
            </div>
            <div style={{ height: 1, background: C.border, marginBottom: 16 }} />
            {enableCoupon !== false ? (
              <NoirCouponRow
                couponCode={couponCode}
                setCouponCode={setCouponCode}
                couponError={couponError}
                applyCoupon={applyCoupon}
                C={C}
                inputTheme={inputTheme}
              />
            ) : null}
            <NoirPricingBreakdown
              subtotal={subtotal}
              shippingInCents={shippingInCents}
              couponApplied={couponApplied}
              discount={discount}
              payMethod={payMethod}
              pricing={pricing}
              totalWithInterest={totalWithInterest}
              C={C}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Desktop sidebar for CheckoutNoir */
export function NoirDesktopSidebar({
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
  C,
  inputTheme,
  enableCoupon,
}: NoirOrderSummaryProps) {
  return (
    <div className="ck-col ck-desktop-only" style={{ flex: '1 1 28%', minWidth: 260 }}>
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: UI.radiusMd,
          padding: '24px 20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>RESUMO</h3>

        {enableCoupon !== false ? (
          <>
            <NoirCouponRow
              couponCode={couponCode}
              setCouponCode={setCouponCode}
              couponError={couponError}
              applyCoupon={applyCoupon}
              C={C}
              inputTheme={inputTheme}
            />
            {!couponError ? <div style={{ marginBottom: 12 }} /> : null}
          </>
        ) : null}

        <NoirPricingBreakdown
          subtotal={subtotal}
          shippingInCents={shippingInCents}
          couponApplied={couponApplied}
          discount={discount}
          payMethod={payMethod}
          pricing={pricing}
          totalWithInterest={totalWithInterest}
          C={C}
        />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginTop: 24 }}>
          <NoirProductThumb productImage={productImage} productName={productName} size={72} C={C} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: C.text3,
                lineHeight: 1.4,
                marginBottom: 4,
              }}
            >
              {productName}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10 }}>
              {fmt.brl(unitPriceInCents)}
            </div>
            <NoirQtyControl qty={qty} setQty={setQty} C={C} size="sm" />
          </div>
        </div>
      </div>

      {testimonials.map((t) => (
        <NoirTestimonialCard key={`${t.name}-${t.text.slice(0, 24)}`} testimonial={t} C={C} />
      ))}
    </div>
  );
}
