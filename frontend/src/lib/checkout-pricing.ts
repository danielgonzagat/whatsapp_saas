 
/** Stub — checkout pricing calculator */
export function buildCheckoutPricing(opts: {
  baseTotalInCents: number;
  paymentMethod: string;
  installments: number;
  installmentInterestMonthlyPercent?: number;
}) {
  const {
    baseTotalInCents,
    paymentMethod,
    installments,
    installmentInterestMonthlyPercent = 3.99,
  } = opts;

  let chargedTotalInCents = baseTotalInCents;
  let installmentInterestInCents = 0;

  if (paymentMethod === 'credit' && installments > 1) {
    const monthlyRate = installmentInterestMonthlyPercent / 100;
    const factor =
      (monthlyRate * Math.pow(1 + monthlyRate, installments)) /
      (Math.pow(1 + monthlyRate, installments) - 1);
    chargedTotalInCents = Math.round((baseTotalInCents * factor * installments) / installments);
    chargedTotalInCents = Math.round(factor * baseTotalInCents);
    installmentInterestInCents = chargedTotalInCents - baseTotalInCents;
  }

  return {
    baseTotalInCents,
    chargedTotalInCents,
    installmentInterestInCents,
    installments,
    perInstallmentInCents:
      installments > 0 ? Math.round(chargedTotalInCents / installments) : chargedTotalInCents,
  };
}
