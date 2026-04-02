/** Checkout pricing calculator — simple interest per extra installment month */
export function buildCheckoutPricing(opts: {
  baseTotalInCents: number;
  paymentMethod: string;
  installments: number;
  installmentInterestMonthlyPercent?: number;
}) {
  const { baseTotalInCents, paymentMethod, installmentInterestMonthlyPercent = 3.99 } = opts;
  const isCreditCard = paymentMethod === 'credit';
  const installments = isCreditCard ? opts.installments : 1;
  let chargedTotalInCents = baseTotalInCents;
  let installmentInterestInCents = 0;
  if (isCreditCard && installments > 1) {
    const extraMonths = installments - 1;
    const rate = installmentInterestMonthlyPercent / 100;
    installmentInterestInCents = Math.round(baseTotalInCents * rate * extraMonths);
    chargedTotalInCents = baseTotalInCents + installmentInterestInCents;
  }
  return {
    baseTotalInCents,
    chargedTotalInCents,
    installmentInterestInCents,
    installmentInterestMonthlyPercent,
    installments,
    perInstallmentInCents:
      installments > 0 ? Math.round(chargedTotalInCents / installments) : chargedTotalInCents,
  };
}
