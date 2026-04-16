const D_RE = /\D/g;
function toDigits(value: unknown) {
  return (
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  ).replace(D_RE, '');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toSafeMoney(value: unknown) {
  return Math.max(0, Math.round(Number(value || 0)));
}

export type CheckoutShippingProfile = {
  mode: 'FREE' | 'FIXED' | 'VARIABLE';
  fixedShippingInCents: number;
  originZip: string;
  variableMinInCents: number;
  variableMaxInCents: number;
  useKloelCalculator: boolean;
};

export function resolveCheckoutShippingProfile(
  plan: any,
  checkoutConfig?: any | null,
): CheckoutShippingProfile {
  const configMode = String(checkoutConfig?.shippingMode || '')
    .trim()
    .toUpperCase();
  const mode: CheckoutShippingProfile['mode'] =
    configMode === 'VARIABLE'
      ? 'VARIABLE'
      : configMode === 'FIXED'
        ? 'FIXED'
        : plan?.freeShipping
          ? 'FREE'
          : Number(plan?.shippingPrice || 0) > 0
            ? 'FIXED'
            : 'FREE';

  const variableMinInCents = toSafeMoney(checkoutConfig?.shippingVariableMinInCents);
  const variableMaxInCents = Math.max(
    variableMinInCents,
    toSafeMoney(checkoutConfig?.shippingVariableMaxInCents),
  );

  return {
    mode,
    fixedShippingInCents: toSafeMoney(plan?.shippingPrice),
    originZip: toDigits(checkoutConfig?.shippingOriginZip).slice(0, 8),
    variableMinInCents,
    variableMaxInCents,
    useKloelCalculator: Boolean(checkoutConfig?.shippingUseKloelCalculator),
  };
}

export function calculateVariableShippingInCents(input: {
  profile: CheckoutShippingProfile;
  destinationZip: string;
  planPriceInCents: number;
}) {
  const destinationZip = toDigits(input.destinationZip).slice(0, 8);
  const originZip = input.profile.originZip;

  if (!destinationZip || !originZip) {
    return input.profile.variableMinInCents;
  }

  const originRegion = Number(originZip.slice(0, 5) || 0);
  const destinationRegion = Number(destinationZip.slice(0, 5) || 0);
  const geographicRatio = clamp(Math.abs(originRegion - destinationRegion) / 99999, 0, 1);
  const priceRatio = clamp(toSafeMoney(input.planPriceInCents) / 250000, 0, 1);
  const blend = input.profile.useKloelCalculator
    ? clamp(geographicRatio * 0.72 + priceRatio * 0.28, 0, 1)
    : geographicRatio;

  return Math.round(
    input.profile.variableMinInCents +
      (input.profile.variableMaxInCents - input.profile.variableMinInCents) * blend,
  );
}

export function buildCheckoutShippingQuote(input: {
  plan: any;
  checkoutConfig?: any | null;
  destinationZip?: string | null;
}) {
  const profile = resolveCheckoutShippingProfile(input.plan, input.checkoutConfig);

  if (profile.mode === 'FREE') {
    return {
      mode: profile.mode,
      priceInCents: 0,
      method: 'free',
      label: 'Frete gratis',
      deliveryEstimate: '5-10 dias uteis',
    };
  }

  if (profile.mode === 'FIXED') {
    return {
      mode: profile.mode,
      priceInCents: profile.fixedShippingInCents,
      method: 'fixed',
      label: 'Frete fixo',
      deliveryEstimate: '5-10 dias uteis',
    };
  }

  const destinationZip = toDigits(input.destinationZip).slice(0, 8);
  const priceInCents = calculateVariableShippingInCents({
    profile,
    destinationZip,
    planPriceInCents: toSafeMoney(input.plan?.priceInCents),
  });
  const originRegion = Number(profile.originZip.slice(0, 5) || 0);
  const destinationRegion = Number(destinationZip.slice(0, 5) || 0);
  const ratio = clamp(Math.abs(originRegion - destinationRegion) / 99999, 0, 1);
  const minDays = 3 + Math.round(ratio * 4);
  const maxDays = minDays + 3;

  return {
    mode: profile.mode,
    priceInCents,
    method: profile.useKloelCalculator ? 'kloel-variable' : 'variable',
    label: profile.useKloelCalculator ? 'Frete calculado pela Kloel' : 'Frete variavel',
    deliveryEstimate: `${minDays}-${maxDays} dias uteis`,
  };
}
