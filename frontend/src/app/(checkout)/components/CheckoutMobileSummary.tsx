'use client';

import { kloelT } from '@/lib/i18n/t';
import { ChDown, ChUp } from './checkout-theme-shared';
import { CheckoutCouponRow } from './CheckoutCouponRow';
import { CheckoutQuantityControl } from './CheckoutQuantityControl';
import { CheckoutSummaryProductRow } from './CheckoutSummaryProductRow';
import { CheckoutSummaryTotals } from './CheckoutSummaryTotals';
import { summaryToggle } from './checkout-summary-helpers';
import type { SummaryProps } from './checkout-summary-types';

/** Checkout mobile summary. */
export function CheckoutMobileSummary(props: SummaryProps) {
  const {
    theme,
    summaryOpen,
    setSummaryOpen,
    qty,
    setQty,
    couponCode,
    setCouponCode,
    couponApplied,
    discount,
    subtotal,
    shippingInCents,
    totalWithInterest,
    productName,
    productImage,
    unitPriceInCents,
    fmtBrl,
    onApplyCoupon,
  } = props;

  return (
    <div
      className="ck-mobile-only"
      style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 16px' }}
    >
      <div
        style={{
          background: theme.cardBackground,
          borderRadius: 12,
          border: `1px solid ${theme.cardBorder}`,
          boxShadow: theme.cardShadow,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setSummaryOpen((value) => !value)}
          style={summaryToggle(theme)}
        >
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>
              {kloelT(`RESUMO (`)}
              {qty})
            </span>
            <br />
            <span style={{ fontSize: 12, color: theme.mutedText, fontWeight: 400 }}>
              {kloelT(`Informações da sua compra`)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: theme.mutedText }}>
              {fmtBrl(totalWithInterest)}
            </span>
            {summaryOpen ? <ChUp /> : <ChDown />}
          </div>
        </button>
        {summaryOpen ? (
          <div style={{ padding: '0 20px 20px' }}>
            <CheckoutSummaryProductRow
              theme={theme}
              productImage={productImage}
              productName={productName}
              unitPriceInCents={unitPriceInCents}
              fmtBrl={fmtBrl}
            />
            <CheckoutQuantityControl theme={theme} qty={qty} setQty={setQty} />
            <CheckoutCouponRow
              theme={theme}
              couponCode={couponCode}
              setCouponCode={setCouponCode}
              onApplyCoupon={onApplyCoupon}
            />
            <CheckoutSummaryTotals
              theme={theme}
              couponApplied={couponApplied}
              discount={discount}
              subtotal={subtotal}
              shippingInCents={shippingInCents}
              totalWithInterest={totalWithInterest}
              fmtBrl={fmtBrl}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
