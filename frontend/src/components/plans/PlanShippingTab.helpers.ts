// Pure helpers extracted from PlanShippingTab.tsx to reduce cyclomatic
// complexity of the plan-data loader useEffect. Behaviour is byte-identical
// to the original inline implementation.

export interface PlanShippingSetters {
  /** Set package type property. */
  setPackageType: (value: string) => void;
  /** Set width property. */
  setWidth: (value: string) => void;
  /** Set height property. */
  setHeight: (value: string) => void;
  /** Set length property. */
  setLength: (value: string) => void;
  /** Set weight property. */
  setWeight: (value: string) => void;
  /** Set who ships property. */
  setWhoShips: (value: string) => void;
  /** Set ship from property. */
  setShipFrom: (value: string) => void;
  /** Set dispatch time property. */
  setDispatchTime: (value: string) => void;
  /** Set selected carriers property. */
  setSelectedCarriers: (value: string[]) => void;
  /** Set freight type property. */
  setFreightType: (value: string) => void;
  /** Set fixed freight property. */
  setFixedFreight: (value: string) => void;
  /** Set has tracking property. */
  setHasTracking: (value: string) => void;
  /** Set region prazos property. */
  setRegionPrazos: (value: Record<string, { prazo: string; obs: string }>) => void;
  /** Set faq answers property. */
  setFaqAnswers: (value: Record<number, string>) => void;
}

/** Plan shipping body input shape. */
export interface PlanShippingBodyInput {
  /** Package type property. */
  packageType: string;
  /** Width property. */
  width: string;
  /** Height property. */
  height: string;
  /** Length property. */
  length: string;
  /** Weight property. */
  weight: string;
  /** Who ships property. */
  whoShips: string;
  /** Ship from property. */
  shipFrom: string;
  /** Dispatch time property. */
  dispatchTime: string;
  /** Selected carriers property. */
  selectedCarriers: string[];
  /** Freight type property. */
  freightType: string;
  /** Fixed freight property. */
  fixedFreight: string;
  /** Region prazos property. */
  regionPrazos: Record<string, { prazo: string; obs: string }>;
  /** Has tracking property. */
  hasTracking: string;
  /** Faq answers property. */
  faqAnswers: Record<number, string>;
}

function applyIfPresent<T>(
  payload: Record<string, unknown>,
  key: string,
  setter: (value: T) => void,
  transform: (raw: unknown) => T,
): void {
  const raw = payload[key];
  if (raw != null) {
    setter(transform(raw));
  }
}

const asString = (raw: unknown) => String(raw);
const asStringArray = (raw: unknown) => raw as string[];
const asRegionMap = (raw: unknown) => raw as Record<string, { prazo: string; obs: string }>;
const asFaqMap = (raw: unknown) => raw as Record<number, string>;

/** Create initial region prazos. */
export function createInitialRegionPrazos(regions: string[]) {
  return Object.fromEntries(
    regions.map((region) => [region, { prazo: '5-7 dias', obs: 'Entrega normal' }]),
  );
}

/** Create initial faq answers. */
export function createInitialFaqAnswers(
  questions: string[],
  answers: Record<number, string[]>,
): Record<number, string> {
  return Object.fromEntries(questions.map((_, index) => [index, answers[index]?.[0] || '']));
}

/** Toggle selected carrier. */
export function toggleSelectedCarrier(
  selectedCarriers: string[],
  carrier: string,
  checked: boolean,
) {
  return checked
    ? [...selectedCarriers, carrier]
    : selectedCarriers.filter((currentCarrier) => currentCarrier !== carrier);
}

/** Build plan shipping body. */
export function buildPlanShippingBody(input: PlanShippingBodyInput) {
  return {
    packageType: input.packageType,
    dimensions: { width: input.width, height: input.height, length: input.length },
    weight: input.weight,
    shipper: input.whoShips,
    shipFrom: input.shipFrom,
    dispatchTime: input.dispatchTime,
    carriers: input.selectedCarriers,
    shippingCost: input.freightType === 'fixed' ? input.fixedFreight : input.freightType,
    regionPrazos: input.regionPrazos,
    tracking: input.hasTracking,
    faqAnswers: input.faqAnswers,
  };
}

/** Apply plan shipping payload. */
export function applyPlanShippingPayload(
  payload: Record<string, unknown>,
  setters: PlanShippingSetters,
): void {
  const dims = payload.dimensions as Record<string, unknown> | undefined;
  applyIfPresent(payload, 'packageType', setters.setPackageType, asString);
  if (dims?.width != null) {
    setters.setWidth(String(dims.width));
  }
  if (dims?.height != null) {
    setters.setHeight(String(dims.height));
  }
  if (dims?.length != null) {
    setters.setLength(String(dims.length));
  }
  applyIfPresent(payload, 'weight', setters.setWeight, asString);
  applyIfPresent(payload, 'whoShips', setters.setWhoShips, asString);
  applyIfPresent(payload, 'shipFrom', setters.setShipFrom, asString);
  applyIfPresent(payload, 'dispatchTime', setters.setDispatchTime, asString);
  applyIfPresent(payload, 'carriers', setters.setSelectedCarriers, asStringArray);
  applyIfPresent(payload, 'freightType', setters.setFreightType, asString);
  applyIfPresent(payload, 'fixedFreight', setters.setFixedFreight, asString);
  applyIfPresent(payload, 'tracking', setters.setHasTracking, asString);
  applyIfPresent(payload, 'regionPrazos', setters.setRegionPrazos, asRegionMap);
  applyIfPresent(payload, 'faqAnswers', setters.setFaqAnswers, asFaqMap);
}
