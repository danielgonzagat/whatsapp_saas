import { formatBRLFromCents } from '@/lib/common/money';
import { formatTime as formatClock } from '@/lib/common/format';

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

/** Format brl. Re-exported from the canonical cents formatter. */
export function formatBRL(cents: number): string {
  return formatBRLFromCents(cents);
}

/** Format time. Re-exported from the canonical mm:ss clock formatter. */
export function formatTime(seconds: number): string {
  return formatClock(seconds);
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
