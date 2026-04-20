// Pure helpers extracted from PlanShippingTab.tsx to reduce cyclomatic
// complexity of the plan-data loader useEffect. Behaviour is byte-identical
// to the original inline implementation.

export interface PlanShippingSetters {
  setPackageType: (value: string) => void;
  setWidth: (value: string) => void;
  setHeight: (value: string) => void;
  setLength: (value: string) => void;
  setWeight: (value: string) => void;
  setWhoShips: (value: string) => void;
  setShipFrom: (value: string) => void;
  setDispatchTime: (value: string) => void;
  setSelectedCarriers: (value: string[]) => void;
  setFreightType: (value: string) => void;
  setFixedFreight: (value: string) => void;
  setHasTracking: (value: string) => void;
  setRegionPrazos: (value: Record<string, { prazo: string; obs: string }>) => void;
  setFaqAnswers: (value: Record<number, string>) => void;
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
