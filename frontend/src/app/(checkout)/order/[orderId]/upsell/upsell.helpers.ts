/** Upsell data shape. */
export interface UpsellData {
  id: string;
  title: string;
  headline: string;
  description: string;
  productName: string;
  image?: string;
  priceInCents: number;
  compareAtPrice?: number;
  acceptBtnText?: string;
  declineBtnText?: string;
  timerSeconds?: number;
  chargeType: 'ONE_CLICK' | 'NEW_PAYMENT';
}

/** Order upsells response shape. */
export interface OrderUpsellsResponse {
  upsells: UpsellData[];
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
