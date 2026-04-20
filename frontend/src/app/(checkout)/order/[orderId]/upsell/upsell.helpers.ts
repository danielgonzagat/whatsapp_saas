/** Upsell data shape. */
export interface UpsellData {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Headline property. */
  headline: string;
  /** Description property. */
  description: string;
  /** Product name property. */
  productName: string;
  /** Image property. */
  image?: string;
  /** Price in cents property. */
  priceInCents: number;
  /** Compare at price property. */
  compareAtPrice?: number;
  /** Accept btn text property. */
  acceptBtnText?: string;
  /** Decline btn text property. */
  declineBtnText?: string;
  /** Timer seconds property. */
  timerSeconds?: number;
  /** Charge type property. */
  chargeType: 'ONE_CLICK' | 'NEW_PAYMENT';
}

/** Order upsells response shape. */
export interface OrderUpsellsResponse {
  /** Upsells property. */
  upsells: UpsellData[];
  /** Current index property. */
  currentIndex: number;
}

/** Format brl. */
export function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/** Format time. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Parse upsells query. */
export function parseUpsellsQuery(raw: string | null): UpsellData[] | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(raw)) as UpsellData[];
  } catch {
    return null;
  }
}
